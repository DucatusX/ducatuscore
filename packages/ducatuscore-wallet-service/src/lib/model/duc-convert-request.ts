interface IDucConvertRequest {
  walletId: string;
  ducxAddress: string;
  completed: boolean;
  createdAt?: Date;
  completedAt?: Date;
}

export class DucConvertRequest implements IDucConvertRequest {
  walletId: string;
  ducxAddress: string;
  completed: boolean;
  createdAt?: Date;
  completedAt?: Date;

  constructor(walletId: string, ducxAddress: string, completed: boolean = false) {
    this.walletId = walletId;
    this.ducxAddress = ducxAddress;
    this.completed = completed;
  }
}
