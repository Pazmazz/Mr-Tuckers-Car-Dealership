const express = require("express");
const router = express.Router();
const prisma = require('../../prisma/prisma');

// Get all employees
router.get('/', async (req, res) => {
    try {
        const employees = await prisma.employee.findMany({
            include: { Transactions: true },
        });
        res.json(employees);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
});

// Get a single employee
router.get('/:id', async (req, res) => {
    try {
        const employees = await prisma.employee.findUnique({
            where: { employee_id: Number(req.params.id) },
            include: { Transactions: true },
        });
        if (!employees) return res.status(404).json({ error: 'Employee not found' });
        res.json(employees);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch employee' });
    }
});

// Create a new employee
router.post('/', async (req, res) => {
    try {
        const { employee_name, department, manager, commission } = req.body;
        const employee = await prisma.employee.create({
            data: { 
                employee_name, 
                department, 
                manager,
                commission
            },
            include: { Transactions: true },
        });
        res.status(201).json(employee);
    } catch (error) { 
        res.status(400).json({ error: 'Failed to create employee' });
    }
});

// Update a pre-existing employee
router.put('/:id', async (req, res) => {
    try {
        const { employee_name, department, manager, commission } = req.body;
        const employee = await prisma.employee.update({
            where: { employee_id: Number(req.params.id) },
            data: {
                ...(employee_name !== undefined && { employee_name }),
                ...(department !== undefined && { department }),
                ...(manager !== undefined && { manager }),
                ...(commission !== undefined && { commission })
            },
            include: { Transactions: true },
        });
        res.json(employee);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.status(400).json({ error: 'Failed to update employee' });
    }
});

// Delete an employee
router.delete('/:id', async (req, res) => {
    try {
        await prisma.employee.delete({
            where: { employee_id: Number(req.params.id) },
        });
        res.status(204).send();
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.status(400).json({ error: 'Failed to delete an employee' });
    }
});

module.exports = router;