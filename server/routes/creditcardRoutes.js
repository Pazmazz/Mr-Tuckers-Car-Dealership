const express = require("express");
const router = express.Router();
const prisma = require('../../prisma/prisma');

// Get all credit cards
router.get('/', async (req, res) => {
    try {
        const credit_cards = await prisma.credit_card.findMany({
            include: { Customer: true },
        });
        res.json(credit_cards);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch credit cards' });
    }
});

// Get a single credit card
router.get('/:id', async (req, res) => {
    try {
        const credit_card = await prisma.credit_card.findUnique({
            where: { credit_card_number: Number(req.params.id) },
            include: { Customer: true },
        });
        if (!credit_card) return res.status(404).json({ error: 'Credit card not found' });
        res.json(credit_card);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch credit card' });
    }
});

// Create a new credit card
router.post('/', async (req, res) => {
    try {
        const { credit_card_number, holder_name, security_code, expiration_date, zip_code } = req.body;
        const credit_card = await prisma.credit_card.create({
            data: { 
                credit_card_number, 
                holder_name, 
                security_code, 
                expiration_date,
                zip_code
            },
            include: { Customer: true },
        });
        res.status(201).json(credit_card);
    } catch (error) { 
        res.status(400).json({ error: 'Failed to create credit card' });
    }
});

// Update a pre-existing credit card
router.put('/:id', async (req, res) => {
    try {
        const { credit_card_number, holder_name, security_code, expiration_date, zip_code } = req.body;
        const credit_card = await prisma.credit_card.update({
            where: { credit_card_number: Number(req.params.id) },
            data: {
                ...(credit_card_number !== undefined && { credit_card_number }),
                ...(holder_name !== undefined && { holder_name }),
                ...(security_code !== undefined && { security_code }),
                ...(expiration_date !== undefined && { expiration_date }),
                ...(zip_code !== undefined && { zip_code })
            },
            include: { Customer: true },
        });
        res.json(credit_card);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Credit card not found' });
        }
        res.status(400).json({ error: 'Failed to update credit card' });
    }
});

// Delete a credit card
router.delete('/:id', async (req, res) => {
    try {
        await prisma.credit_card.delete({
            where: { credit_card_number: Number(req.params.id) },
        });
        res.status(204).send();
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Credit card not found' });
        }
        res.status(400).json({ error: 'Failed to delete credit card' });
    }
});

module.exports = router;