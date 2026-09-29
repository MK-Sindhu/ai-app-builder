import express, { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { AutoScalingClient, SetDesiredCapacityCommand, DescribeAutoScalingGroupsCommand, SetInstanceProtectionCommand, TerminateInstanceInAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";
import { EC2Client, DescribeInstancesCommand, CreateTagsCommand } from "@aws-sdk/client-ec2";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 9092);
const ASG_NAME = process.env.ASG_NAME ?? "vscode-asg";
// How many idle machines we try to keep warm for new projects
const IDLE_BUFFER = 2;
// Set IDLE_TIMEOUT_MINUTES to terminate a project's machine once its page has been closed that long
// (the page asks every minute while open). Off by default: machines are kept until POST /destroy,
// so project files are never lost.
const IDLE_TIMEOUT_MINUTES = Number(process.env.IDLE_TIMEOUT_MINUTES ?? 0);
// Instance tag that records which project owns a machine, so assignments survive a restart
const PROJECT_TAG = "assignedProject";
// "private" when the orchestrator runs in the same VPC as the machines, "public" for local dev
const WORKER_ADDRESS = process.env.WORKER_ADDRESS ?? "private";

// No explicit credentials: locally the SDK reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY,
// on AWS it uses the IAM role attached to the server
const region = process.env.AWS_REGION ?? "eu-north-1";
const client = new AutoScalingClient({ region });
const ec2Client = new EC2Client({ region });

type Machine = {
    instanceId: string;
    publicDns: string;
    privateIp: string;
    isUsed: boolean;
    assignedProject?: string;
    // When the backend last asked for this machine (ms since epoch)
    lastSeen: number;
}

let ALL_MACHINES: Machine[] = [];
// The group's MaxSize, 0 until the first refresh finishes
let maxSize = 0;

// Instances we asked AWS to terminate, so a refresh doesn't add them back as idle
const terminatingIds = new Set<string>();

// Only our backend may call the orchestrator; it sends ORCHESTRATOR_SECRET as a bearer token
function requireSecret(req: Request, res: Response, next: NextFunction) {
    const secret = Buffer.from(process.env.ORCHESTRATOR_SECRET ?? "");
    const token = Buffer.from(req.headers.authorization?.split(" ")[1] ?? "");
    if (secret.length === 0 || token.length !== secret.length || !timingSafeEqual(token, secret)) {
        res.status(401).send({ message: "Unauthorized" });
        return;
    }
    next();
}

// A new machine is ready once both the worker and code-server answer
async function isHealthy(host: string) {
    try {
        const [worker, codeServer] = await Promise.all([
            fetch(`http://${host}:9091/health`, { signal: AbortSignal.timeout(2000) }),
            fetch(`http://${host}:8080/healthz`, { signal: AbortSignal.timeout(2000) }),
        ]);
        return worker.ok && codeServer.ok;
    } catch {
        return false;
    }
}

async function refreshInstances() {
    const groupResponse = await client.send(new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [ASG_NAME]
    }));
    const group = groupResponse.AutoScalingGroups?.[0];
    if (!group) {
        throw new Error(`Auto scaling group ${ASG_NAME} not found`);
    }
    maxSize = group.MaxSize ?? 0;

    // Only machines that are healthy and not being terminated
    const instanceIds = (group.Instances ?? [])
        .filter(x => x.LifecycleState === "InService")
        .map(x => x.InstanceId!);

    if (instanceIds.length === 0) {
        ALL_MACHINES = [];
        return;
    }

    const ec2InstanceCommand = new DescribeInstancesCommand({
        InstanceIds: instanceIds
    })
    const ec2Response = await ec2Client.send(ec2InstanceCommand);

    const candidates: Omit<Machine, "isUsed" | "lastSeen">[] = [];
    for (const reservation of ec2Response.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
            const instanceId = instance.InstanceId;
            const publicDns = instance.PublicDnsName || instance.PublicIpAddress;
            const privateIp = instance.PrivateIpAddress;
            if (!instanceId || !publicDns || !privateIp || instance.State?.Name !== "running") {
                continue;
            }
            const assignedProject = instance.Tags?.find(x => x.Key === PROJECT_TAG)?.Value;
            candidates.push({ instanceId, publicDns, privateIp, assignedProject });
        }
    }

    // Machines we already know are ready; new ones must pass a health check first
    const known = new Set(ALL_MACHINES.map(x => x.instanceId));
    const ready = await Promise.all(candidates.map(c =>
        known.has(c.instanceId) || isHealthy(WORKER_ADDRESS === "public" ? c.publicDns : c.privateIp)
    ));

    // Enrich the ALL_MACHINES array with the new instances and remove the instances that have died.
    // Built after the awaits so assignments made in the meantime are kept.
    ALL_MACHINES = candidates
        .filter((c, i) => ready[i] && !terminatingIds.has(c.instanceId))
        .map(c => {
            // Reuse the existing entry so isUsed / assignedProject survive the refresh
            const existing = ALL_MACHINES.find(x => x.instanceId === c.instanceId);
            if (existing) {
                existing.publicDns = c.publicDns;
                existing.privateIp = c.privateIp;
                return existing;
            }
            // A machine already tagged with a project (e.g. after a restart) gets a full timeout from now
            return { ...c, isUsed: !!c.assignedProject, lastSeen: Date.now() };
        });
}

// Terminate the machine and lower the group's desired capacity to match
async function destroyMachine(instanceId: string) {
    await client.send(new TerminateInstanceInAutoScalingGroupCommand({
        InstanceId: instanceId,
        ShouldDecrementDesiredCapacity: true
    }));

    terminatingIds.add(instanceId);
    ALL_MACHINES = ALL_MACHINES.filter(x => x.instanceId !== instanceId);
}

// Terminate machines whose project hasn't been open for IDLE_TIMEOUT_MINUTES. They're never handed
// to another project, because they still hold this project's files.
async function releaseIdleMachines() {
    if (IDLE_TIMEOUT_MINUTES <= 0) {
        return;
    }

    const cutoff = Date.now() - IDLE_TIMEOUT_MINUTES * 60 * 1000;
    const idleMachines = ALL_MACHINES.filter(x => x.isUsed && x.lastSeen < cutoff);

    for (const machine of idleMachines) {
        console.log(`Releasing ${machine.instanceId} (project ${machine.assignedProject}), unused for ${IDLE_TIMEOUT_MINUTES} minutes`);
        try {
            await destroyMachine(machine.instanceId);
        } catch (e) {
            console.error(`Failed to release ${machine.instanceId}`, e);
        }
    }
}

// Record the owner on the instance and stop the group from scaling this machine in
async function claimMachine(instanceId: string, projectId: string) {
    await Promise.all([
        ec2Client.send(new CreateTagsCommand({
            Resources: [instanceId],
            Tags: [{ Key: PROJECT_TAG, Value: projectId }]
        })),
        client.send(new SetInstanceProtectionCommand({
            AutoScalingGroupName: ASG_NAME,
            InstanceIds: [instanceId],
            ProtectedFromScaleIn: true
        })),
    ]);
}

// Keep IDLE_BUFFER machines free on top of the ones in use, without going over the group's MaxSize
async function scaleUp() {
    // Don't scale before the first refresh, when we don't know the machines yet
    if (maxSize === 0) {
        return;
    }

    const usedCount = ALL_MACHINES.filter(x => x.isUsed).length;
    const wanted = usedCount + IDLE_BUFFER;
    if (wanted > maxSize) {
        console.warn(`Want ${wanted} machines but ${ASG_NAME} has MaxSize ${maxSize}`);
    }

    const command = new SetDesiredCapacityCommand({
        AutoScalingGroupName: ASG_NAME,
        DesiredCapacity: Math.min(wanted, maxSize)
    })

    await client.send(command);
}

let refreshing = false;
async function refreshLoop() {
    // Skip if the previous refresh is still running, so two refreshes never overwrite each other
    if (refreshing) {
        return;
    }
    refreshing = true;
    try {
        await refreshInstances();
        await releaseIdleMachines();
    } catch (e) {
        console.error(e);
    } finally {
        refreshing = false;
    }
}

refreshLoop();

setInterval(refreshLoop, 10 * 1000);

function toResponse(machine: Machine) {
    return {
        machineId: machine.instanceId,
        publicDns: machine.publicDns,
        privateIp: machine.privateIp
    };
}

app.get("/health", (req, res) => {
    res.send({ status: "ok" });
})

app.get("/project/:projectId", requireSecret, async (req, res) => {
    const projectId = String(req.params.projectId);

    // Same project asking again gets the machine it already has
    const assignedMachine = ALL_MACHINES.find(x => x.assignedProject === projectId);
    if (assignedMachine) {
        assignedMachine.lastSeen = Date.now();
        res.send(toResponse(assignedMachine));
        return;
    }

    const idleMachine = ALL_MACHINES.find(x => x.isUsed === false);
    if (!idleMachine) {
        // Scale up the infra so a machine is free on the next try
        scaleUp().catch(console.error);
        res.status(503).send({ message: "No Idle Machine Found" });
        return;
    }

    idleMachine.isUsed = true;
    idleMachine.assignedProject = projectId;
    idleMachine.lastSeen = Date.now();

    try {
        await claimMachine(idleMachine.instanceId, projectId);
    } catch (e) {
        idleMachine.isUsed = false;
        idleMachine.assignedProject = undefined;
        throw e;
    }

    // Scale up the infra to replace the machine we just handed out
    scaleUp().catch(console.error);

    res.send(toResponse(idleMachine));
})

app.post("/destroy", requireSecret, async (req, res) => {
    const machineId: string | undefined = req.body?.machineId;
    if (!machineId) {
        res.status(400).send({ message: "machineId is required" });
        return;
    }

    try {
        await destroyMachine(machineId);
    } catch (e) {
        console.error(e);
        res.status(500).send({ message: "Failed to destroy machine" });
        return;
    }

    res.send({ message: "Machine destroyed" });
})

// Express 5 sends errors thrown in async handlers here
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    res.status(500).send({ message: "Internal server error" });
})

app.listen(PORT, () => {
    console.log(`Orchestrator is running on port ${PORT}`);
})
