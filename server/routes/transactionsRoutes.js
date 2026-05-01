const express = require("express");
const router = express.Router();
const prisma = require('../../prisma/prisma');

// Get all transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await prisma.transactions.findMany({
            include: {
                Driver_s_License: true,
                Credit_card: true
            },
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Get a single transaction
router.get('/:id', async (req, res) => {
    try {
        const transaction = await prisma.transactions.findUnique({
            where: { transaction_id: Number(req.params.id) },
            include: {
                Driver_s_License: true,
                Credit_card: true
            },
        });
        if (!transaction) return res.status(404).json({ error: 'Transactions not found' });
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Create a new transaction
router.post('/', async (req, res) => {
    try {
        const { date, time, discount, price_paid, price_offered, employee_id, customer_id, vehicle_id } = req.body;
        const transaction = await prisma.transactions.create({
            data: { 
                date, 
                time, 
                discount, 
                price_paid, 
                price_offered, 
                employee_id, 
                customer_id, 
                vehicle_id
            },
            include: {
                Driver_s_License: true,
                Credit_card: true
            },
        });
        res.status(201).json(transaction)
    } catch (error) {
        res.status(400).json({ error: 'Failed to create transaction' });
    }
});

// Update a pre-existing transaction
router.put('/:id', async (req, res) => {
    try {
        const { date, time, discount, price_paid, price_offered, employee_id, customer_id, vehicle_id } = req.body;
        const transaction = await prisma.transaction.update({
            where: { transaction_id: Number(req.params.id) },
            data: {
                ...(date    !== undefined && { date }),
                ...(time     !== undefined && { time }),
                ...(discount !== undefined && { discount }),
                ...(price_paid !== undefined && { price_paid }),
                ...(price_offered !== undefined && { price_offered }),
                ...(employee_id !== undefined && { employee_id }),
                ...(customer_id !== undefined && { customer_id }),
                ...(vehicle_id !== undefined && { vehicle_id })
            },
            include: {
                Driver_s_License: true,
                Credit_card: true
            },
        });
        res.json(transaction);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.status(400).json({ error: 'Failed to update transaction' });
    }
});

// Delete a transaction
router.delete('/:id', async (req, res) => {
    try {
        await prisma.transaction.delete({
            where: { transaction_id: Number(req.params.id) },
        });
        res.status(204).send();
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.status(400).json({ error: 'Failed to delete transaction' });
    }
});

module.exports = router;