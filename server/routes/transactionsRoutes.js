const express = require("express");
const router = express.Router();
const prisma = require('../../prisma/prisma');

// Get all transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await prisma.vehicle.findMany({
            include: {
                Driver_s_License: true,
                Credit_card: true
            },
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

// Get a single transaction
router.get('/:id', async (req, res) => {
    try {
        const vehicle = await prisma.vehicle.findUnique({
            where: { vehicle_id: Number(req.params.id) },
            include: {
                Transactions: true,
            },
        });
        if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
        res.json(vehicle);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vehicle' });
    }
});

// Create a new transaction
router.post('/', async (req, res) => {
    try {
        const { vehicle_type, vehicle_brand, model_year, is_used, mileage, vehicle_price } = req.body;
        const vehicle = await prisma.vehicle.create({
            data: { 
                vehicle_type, 
                vehicle_brand, 
                model_year, 
                is_used, 
                mileage, 
                vehicle_price
            },
            include: {
                Transactions: true,
            },
        });
        res.status(201).json(vehicle)
    } catch (error) {
        res.status(400).json({ error: 'Failed to create vehicle' });
    }
});

// Update a pre-existing transaction
router.put('/:id', async (req, res) => {
    try {
        const { vehicle_type, vehicle_brand, model_year, is_used, mileage, vehicle_price } = req.body;
        const vehicle = await prisma.vehicle.update({
            where: { vehicle_id: Number(req.params.id) },
            data: {
                ...(vehicle_type    !== undefined && { vehicle_type }),
                ...(vehicle_brand     !== undefined && { vehicle_brand }),
                ...(model_year !== undefined && { drivers_lmodel_yearcense_id }),
                ...(is_used !== undefined && { is_used }),
                ...(mileage !== undefined && { mileage }),
                ...(vehicle_price !== undefined && { vehicle_price }),
            },
            include: {
                Transactions: true,
            },
        });
        res.json(vehicle);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        res.status(400).json({ error: 'Failed to update vehicle' });
    }
});

// Delete a transaction
router.delete('/:id', async (req, res) => {
    try {
        await prisma.vehicle.delete({
            where: { vehicle_id: Number(req.params.id) },
        });
        res.status(204).send();
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        res.status(400).json({ error: 'Failed to delete vehicle' });
    }
});

module.exports = router;