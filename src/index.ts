import express from 'express';
import { CaodvClient } from './caodv/client';

const PORT: number = 11342;

const app: express.Application = express();
app.use(express.json());
app.use(express.static("./public"));

app.get('/api/at-log', (req, res) => {
    var log = client.atLog;
    res.status(200).setHeader('Content-Type', 'application/json').send(JSON.stringify(log));
    client.atLog = [];
});

app.get('/api/caodv-log', (req, res) => {
    var log = client.msgLog;
    res.status(200).setHeader('Content-Type', 'application/json').send(JSON.stringify(log));
    client.msgLog = [];
});

app.get('/api/routing-table', (req, res) => {
    res.status(200).setHeader('Content-Type', 'application/json').send(JSON.stringify([...client.routingTable.entries()]));
});

app.get('/api/blacklist', (req, res) => {
    res.status(200).setHeader('Content-Type', 'application/json').send(JSON.stringify([...client.blacklist.entries()]));
});

var client: CaodvClient = new CaodvClient();

app.listen(PORT, () => {
    console.log(`Listening to port ${PORT}`);
    client.start();
    client.requestRoute(10);
});