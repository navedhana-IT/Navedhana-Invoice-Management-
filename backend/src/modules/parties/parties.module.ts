import { Module } from '@nestjs/common';
import { crudController } from './crud.factory';
import * as d from './dto';

/** Company-owned master data: customers, vendors, products, departments, employees. */
@Module({
  controllers: [
    crudController({
      path: 'customers', resource: 'customer', label: 'customer', createDto: d.CustomerDto, updateDto: d.UpdateCustomerDto,
      searchFields: ['name', 'email', 'phone', 'gstin'], sortFields: ['createdAt', 'name'], filters: ['status', 'createdAt'], limit: 'maxCustomers',
    }),
    crudController({
      path: 'vendors', resource: 'vendor', label: 'vendor', createDto: d.VendorDto, updateDto: d.UpdateVendorDto,
      searchFields: ['name', 'email', 'phone', 'gstin'], sortFields: ['createdAt', 'name'], filters: ['status', 'createdAt'], limit: 'maxVendors',
    }),
    crudController({
      path: 'products', resource: 'product', label: 'product', createDto: d.ProductDto, updateDto: d.UpdateProductDto,
      searchFields: ['name', 'sku', 'hsnSac'], sortFields: ['createdAt', 'name', 'unitPrice'], filters: ['isActive'], serviceScoped: true,
    }),
    crudController({
      path: 'departments', resource: 'department', label: 'department', createDto: d.DepartmentDto, updateDto: d.UpdateDepartmentDto,
      searchFields: ['name'], sortFields: ['createdAt', 'name'], serviceScoped: true,
    }),
    crudController({
      path: 'employees', resource: 'employee', label: 'employee', createDto: d.EmployeeDto, updateDto: d.UpdateEmployeeDto,
      searchFields: ['fullName', 'email', 'employeeCode', 'designation'], sortFields: ['createdAt', 'fullName', 'joiningDate'],
      filters: ['status', 'departmentId', 'createdAt'], serviceScoped: true, refs: { departmentId: 'department' }, limit: 'maxEmployees',
    }),
  ],
})
export class PartiesModule {}
