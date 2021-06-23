import express from 'express';
import { CaodvClient } from './caodv/client';

const PORT: number = 11342;

const app: express.Application = express();
app.use(express.json());
app.use(express.static("./public"));

app.get('/api/at-log', (req, res) => {
    res.status(200).send(JSON.stringify(client.atLog));
});

app.get('/api/caodv-log', (req, res) => {
    res.status(200).send(JSON.stringify([1, 2, 3]));
});

app.get('/api/routing-table', (req, res) => {
    res.status(200).send(JSON.stringify(client.routingTable));
});

app.get('/api/blacklist', (req, res) => {
    res.status(200).send(JSON.stringify(client.blacklistClient));
});

var client: CaodvClient = new CaodvClient();
client.start();

app.listen(PORT, () => {
    console.log(`Listening to port ${PORT}`);

    client.requestRoute(13);
});