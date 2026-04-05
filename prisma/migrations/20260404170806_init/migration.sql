-- CreateTable
CREATE TABLE "Credit card" (
    "credit_card_number" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "holder_name" TEXT NOT NULL,
    "security_code" INTEGER NOT NULL,
    "expiration_date" TEXT NOT NULL,
    "zip_code" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "customer_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customer_name" TEXT NOT NULL,
    "credit_score" INTEGER NOT NULL,
    "drivers_license_id" INTEGER NOT NULL,
    "credit_card_number" INTEGER NOT NULL,
    CONSTRAINT "Customer_drivers_license_id_fkey" FOREIGN KEY ("drivers_license_id") REFERENCES "Driver's License" ("drivers_license_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Customer_credit_card_number_fkey" FOREIGN KEY ("credit_card_number") REFERENCES "Credit card" ("credit_card_number") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "Driver's License" (
    "drivers_license_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "holder_name" TEXT NOT NULL,
    "expiration_date" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "birth_date" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "eye_color" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "restrictions" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Employee" (
    "employee_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "department" TEXT NOT NULL,
    "manager" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "employee_name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Log In Creditials" (
    "employee_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "password" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    CONSTRAINT "Log In Creditials_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee" ("employee_id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "Transactions" (
    "transaction_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "price_paid" INTEGER NOT NULL,
    "price_offered" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    CONSTRAINT "Transactions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle" ("vehicle_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Transactions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee" ("employee_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer" ("customer_id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "vehicle_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "vehicle_type" TEXT NOT NULL,
    "vehicle_brand" TEXT NOT NULL,
    "model_year" INTEGER NOT NULL,
    "is_used" INTEGER NOT NULL,
    "mileage" INTEGER NOT NULL,
    "vehicle_price" INTEGER NOT NULL
);
