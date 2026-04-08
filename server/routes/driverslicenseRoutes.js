const express = require("express");
const router = express.Router();
const prisma = require('../prisma/prisma');

// Get all driver's licenses
router.get('/', async (req, res) => {
    try {
        const drivers_licenses = await prisma.driver_s_License.findMany({
            include: { Customer: true },
        });
        res.json(drivers_licenses);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch driver\'s licenses' });
    }
});

// Get a single driver's license
router.get('/:id', async (req, res) => {
    try {
        const drivers_license = await prisma.driver_s_License.findUnique({
            where: { drivers_license_id: Number(req.params.id) },
            include: { Customer: true },
        });
        if (!drivers_license) return res.status(404).json({ error: 'Driver\'s license not found' });
        res.json(drivers_license);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch driver\'s license' });
    }
});

// Create a new driver's license
router.post('/', async (req, res) => {
    try {
        const { drivers_license_id, holder_name, expiration_date, address, birth_date, sex, eye_color, weight, restrictions } = req.body;
        const drivers_license = await prisma.driver_s_License.create({
            data: { 
                drivers_license_id, 
                holder_name, 
                expiration_date, 
                address, 
                birth_date, 
                sex, 
                eye_color, 
                weight, 
                restrictions
            },
            include: { Customer: true },
        });
        res.status(201).json(drivers_license);
    } catch (error) {
        res.status(400).json({ error: 'Failed to create driver\'s license' });
    }
});

// Update a pre-existing driver's license
router.put('/:id', async (req, res) => {
    try {
        const { drivers_license_id, holder_name, expiration_date, address, birth_date, sex, eye_color, weight, restrictions } = req.body;
        const drivers_license = await prisma.driver_s_License.update({
            where: { drivers_license_id: Number(req.params.id) },
            data: {
                ...(drivers_license_id !== undefined && { drivers_license_id }),
                ...(holder_name !== undefined && { holder_name }),
                ...(expiration_date !== undefined && { expiration_date }),
                ...(address !== undefined && { address }),
                ...(birth_date !== undefined && { birth_date }),
                ...(sex !== undefined && { sex }),
                ...(eye_color !== undefined && { eye_color }),
                ...(weight !== undefined && { weight }),
                ...(restrictions !== undefined && { restrictions })
            },
            include: { Customer: true },
        });
        res.json(drivers_license);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Driver\'s license not found' });
        }
        res.status(400).json({ error: 'Failed to update driver\'s license' });
    }
});

// Delete a driver's license
router.delete('/:id', async (req, res) => {
    try {
        await prisma.driver_s_License.delete({
            where: { drivers_license_id: Number(req.params.id) },
        });
        res.status(204).send();
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Driver\'s license not found' });
        }
        res.status(400).json({ error: 'Failed to delete driver\'s license' });
    }
});

module.exports = router;