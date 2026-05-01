// ------ Setup ------
const express = require("express");
const router = express.Router();
const prisma = require('../../prisma/prisma'); // Shared Prisma client instance

// Get all transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await prisma.transactions.findMany({
            include: {
                Driver_s_License: true, // License associated with the customer on this transaction
                Credit_card: true // Card used for this transaction
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
        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
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
                discount, // Discount applied to the sale, if any
                price_paid, // Final amount paid by the customer
                price_offered, // Initial price offered before negotiation/discount
                employee_id, // FK → employee who handled the transaction
                customer_id, // FK → customer making the purchase
                vehicle_id // FK → vehicle being sold
            },
            include: {
                Driver_s_License: true,
                Credit_card: true
            },
        });
        res.status(201).json(transaction); // 201 Created
    } catch (error) {
        res.status(400).json({ error: 'Failed to create transaction' });
    }
});

// Update a pre-existing transaction
router.put('/:id', async (req, res) => {
    try {
        const { date, time, discount, price_paid, price_offered, employee_id, customer_id, vehicle_id } = req.body;
        const transaction = await prisma.transactions.update({
            where: { transaction_id: Number(req.params.id) },
            data: {
                // Spread each field only if it was provided in the request body (partial update pattern)
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
        // Prisma P2025 = record to update not found
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.status(400).json({ error: 'Failed to update transaction' });
    }
});

// Delete a transaction
router.delete('/:id', async (req, res) => {
    try {
        await prisma.transactions.delete({ 
            where: { transaction_id: Number(req.params.id) },
        });
        res.status(204).send(); // 204 No Content — successful delete with no response body
    } catch (error) {
        // Prisma P2025 = record to delete not found
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.status(400).json({ error: 'Failed to delete transaction' });
    }
});

module.exports = router;