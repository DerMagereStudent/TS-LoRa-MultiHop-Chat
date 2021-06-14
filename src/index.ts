import express from 'express';

const PORT: number = 11342;

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send(JSON.stringify([1, 2, 3]));
});

app.listen(PORT, () => {
    console.log(`Listening to port ${PORT}`);
});