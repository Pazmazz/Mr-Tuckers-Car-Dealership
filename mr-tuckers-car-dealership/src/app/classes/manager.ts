class Manager extends Staff
{
    public constructor(protected name: string, protected salary: number, protected department: string, protected id: number)
    {
        super(name, salary, department, id);
    }

    calculateCommisson(): void
    {
        // TODO: Add functionality
    }

    checkCommisson(): void
    {
        // TODO: Add functionality
    }

    generateReport(): void
    {
        
    }
}