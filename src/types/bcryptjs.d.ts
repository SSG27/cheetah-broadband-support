declare module "bcryptjs" {
  interface Bcrypt {
    hash(password: string, salt: number): Promise<string>;
    compare(password: string, hash: string): Promise<boolean>;
  }

  const bcrypt: Bcrypt;
  export default bcrypt;
}
