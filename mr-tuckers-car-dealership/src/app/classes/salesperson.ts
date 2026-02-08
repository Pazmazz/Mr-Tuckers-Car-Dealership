class Salesperson extends Staff
{
    public constructor(protected name: string, protected salary: number, protected department: string, protected id: number)
    {
        super(name, salary, department, id);
    }
}