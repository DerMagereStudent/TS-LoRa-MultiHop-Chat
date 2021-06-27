import express from 'express';
import Joi from 'joi';
import { CaodvClient } from './caodv/client';

const PORT: number = 11342;

const app: express.Application = express();
app.use(express.json());
app.use(express.static("./public"));

const schema = Joi.object({
    dest: Joi.number().min(1).max(20).required(),
    msg: Joi.string().min(1).max(250).required()
});

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

app.get('/api/messages', (req, res) => {
    var msgs = [...client.messages.entries()];
    res.status(200).setHeader('Content-Type', 'application/json').send(JSON.stringify(msgs));
    client.messages.clear();
});

app.post('/api/messages', (req, res) => {
    const result = schema.validate(req.body);

    if (result.error) {
        res.status(400).send(result.error.details[0].message);
        return;
    }

    client.beginSend(req.body.dest, req.body.msg);
    res.status(200).send("");
});

var client: CaodvClient = new CaodvClient();

app.listen(PORT, () => {
    console.log(`Listening to port ${PORT}`);
    client.start();
});