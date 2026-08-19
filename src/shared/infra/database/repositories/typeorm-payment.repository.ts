import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../../domain/entities/payment';
import {
  CreatePaymentInput,
  PaymentRepository,
} from '../../../domain/repositories/payment.repository';
import { PaymentEntity } from '../entities/payment.entity';

@Injectable()
export class TypeOrmPaymentRepository implements PaymentRepository {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly repository: Repository<PaymentEntity>,
  ) {}

  async create(input: CreatePaymentInput): Promise<Payment> {
    const entity = this.repository.create(input);
    return this.repository.save(entity);
  }
}
