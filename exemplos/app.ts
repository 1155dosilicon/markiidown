// Exemplo de código TypeScript
export interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

export class UserManager {
  private users: Map<number, User> = new Map();

  constructor() {
    console.log("UserManager iniciado com sucesso!");
  }

  public addUser(user: User): boolean {
    if (this.users.has(user.id)) {
      return false;
    }
    this.users.set(user.id, user);
    return true;
  }

  public async fetchRemoteUsers(url: string): Promise<User[]> {
    const response = await fetch(url);
    const data = (await response.json()) as User[];
    return data;
  }
}
