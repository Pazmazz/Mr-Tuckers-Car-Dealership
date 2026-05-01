// ------ Setup ------
const express = require("express");
const router = express.Router();
const prisma = require('../../prisma/prisma'); // Shared Prisma client instance

// Get all customers
router.get('/', async (req, res) => {
    try {
        const customers = await prisma.customer.findMany({
            include: {
                Driver_s_License: true, // Related driver's license record
                Credit_card: true, // Related credit card record
                Transactions: true, // All transactions linked to this customer
            },
        });
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Get a single customer
router.get('/:id', async (req, res) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { customer_id: Number(req.params.id) },
            include: {
                Driver_s_License: true,
                Credit_card: true,
                Transactions: true,
            },
        });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// Create a new customer
router.post('/', async (req, res) => {
    try {
        const { customer_name, credit_score, drivers_license_id, credit_card_number, address, phone} = req.body;
        const customer = await prisma.customer.create({
            data: { 
                customer_name, 
                credit_score, 
                drivers_license_id, 
                credit_card_number,
                address, 
                phone
            },
            include: {
                Driver_s_License: true,
                Credit_card: true,
                Transactions: true,
            },
        });
        res.status(201).json(customer); // 201 Created
    } catch (error) {
        if (error.code === 'P2003') {
          // Prisma foreign key constraint error
          return res.status(400).json({ error: 'Invalid drivers_license_id or credit_card_number — referenced record does not exist' });
        }
        res.status(400).json({ error: 'Failed to create customer' });
    }
});

// Update a pre-existing customer
router.put('/:id', async (req, res) => {
    try {
        const { customer_name, credit_score, drivers_license_id, credit_card_number, address, phone } = req.body;
        const customer = await prisma.customer.update({
            where: { customer_id: Number(req.params.id) },
            data: {
                // Spread each field only if provided (partial update pattern)
                ...(customer_name      !== undefined && { customer_name }),
                ...(credit_score       !== undefined && { credit_score }),
                ...(drivers_license_id !== undefined && { drivers_license_id }),
                ...(credit_card_number !== undefined && { credit_card_number }),
                ...(address            !== undefined && { address }),
                ...(phone              !== undefined && { phone }),
            },
            include: {
                Driver_s_License: true,
                Credit_card: true,
                Transactions: true,
            },
        });
        res.json(customer);
    } catch (error) {
        // Prisma P2025 = record to update not found
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Customer not found' });
        }
        // Prisma P2003 = foreign key constraint violation on the updated fields
        if (error.code === 'P2003') {
            return res.status(400).json({ error: 'Invalid drivers_license_id or credit_card_number' });
        }
        res.status(400).json({ error: 'Failed to update customer' });
    }
});

// Delete a customer
router.delete('/:id', async (req, res) => {
    try {
        await prisma.customer.delete({
            where: { customer_id: Number(req.params.id) },
        });
        res.status(204).send(); // 204 No Content — successful delete with no response body
    } catch (error) {
        // Prisma P2025 = record to delete not found
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Customer not found' });
        }
        // Prisma P2003 = delete blocked by a related record (e.g. existing transactions)
        if (error.code === 'P2003') {
            return res.status(400).json({ error: 'Cannot delete — customer has related transactions' });
        }
        res.status(400).json({ error: 'Failed to delete customer' });
    }
});

// Get all transactions for a specific customer
router.get('/:id/transactions', async (req, res) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { customer_id: Number(req.params.id) },
            include: { Transactions: true },
        });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json(customer.Transactions); // Return just the transactions, not the full customer object
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

module.exports = router;