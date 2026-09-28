import express from "express";
import { AutoScalingClient, SetDesiredCapacityCommand, DescribeAutoScalingInstancesCommand, UpdateAutoScalingGroupCommand, TerminateInstanceInAutoScalingGroup$, TerminateInstanceInAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";
const { EC2Client, DescribeInstancesCommand } = require("@aws-sdk/client-ec2");

const app = express();

const client = new AutoScalingClient({ region: "eu-north-1", credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_ACCESS_SECRET!,
} });

const ec2Client = new EC2Client({ region: "eu-north-1", credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_ACCESS_SECRET!,
}
});

type Machine = {
    ip: String;
    isUsed: Boolean;
    assignedProject?: String;
}

const ALL_MACHINES: Machine[] = [] 

async function refreshInstances() {
    const command = new DescribeAutoScalingInstancesCommand();
    const data = await client.send(command);

    const instanceIds = data.AutoScalingInstances?.map(x => x.InstanceId) ?? [];
    if (instanceIds.length === 0) {
        console.log("No instances in the auto scaling group yet");
        return;
    }

    const ec2InstanceCommand = new DescribeInstancesCommand({
        InstanceIds: instanceIds
    })
    const ec2Response = await ec2Client.send(ec2InstanceCommand);
    console.log(JSON.stringify(ec2Response.Reservations?.[0]?.Instances?.[0]?.PublicDnsName))
    // Enrich the ALL_MACHINES array with the new instances and remove the instaces the have died
}

refreshInstances();

setInterval(() => {
    refreshInstances();
}, 10 * 1000);

app.get("/:projectId", (req, res) => {
    const idleMachine = ALL_MACHINES.find(x => x.isUsed === false);
    if (!idleMachine) {
        // S=scale up the infra
        res.status(404).send("No Idle Machine Found")
        return;
    }

    idleMachine.isUsed = true;
    // scale up the infra

    const command = new SetDesiredCapacityCommand({
    AutoScalingGroupName: "vscode-asg",
    DesiredCapacity: ALL_MACHINES.length + (5 - ALL_MACHINES.filter(x => x.isUsed === false).length)
    })
    
    client.send(command);

    res.send({
        ip: idleMachine.ip

    });
})

app.post("/destroy", (req, res) =>{
    const machineId: string = req.body.machineId;

    const command = new TerminateInstanceInAutoScalingGroupCommand({
        InstanceId: machineId,
        ShouldDecrementDesiredCapacity: true

    })

    client.send(command)
})

app.listen(9092)