import express from "express";
import { AutoScalingClient,SetDesiredCapacityCommand, DescribeAutoScalingInstancesCommand, UpdateAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";

const app = express();

const client = new AutoScalingClient({ region: "eu-north-1", credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_ACCESS_SECRET!,
} });

type Machine = {
    ip: String;
    isUsed: Boolean;
    assignedProject?: String;
}

const ALL_MACHINES: Machine = [] 

async function refreshInstances() {
    const command = new DescribeAutoScalingInstancesCommand();
    const data = await client.send(command);
    console.log(data);
}

refreshInstances();

setInterval(() => {
    refreshInstances();
}, 10 * 1000);

app.get("/:projectId", (req, res) => {
    res.send("Hello world")
})

// const command = new SetDesiredCapacityCommand({
//     AutoScalingGroupName: "vscode-asg",
//     DesiredCapacity: 5,
// });

// const command = new UpdateAutoScalingGroupCommand({
//     AutoScalingGroupName: "vscode-asg",
//     MaxSize: 5,
// });

// const data = await client.send(command);

// console.log(data);  

