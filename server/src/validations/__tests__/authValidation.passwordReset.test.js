const { resetPasswordSchema } = require('../authValidation');

describe('authValidation resetPasswordSchema', () => {
  it('rejects password shorter than 8 characters', () => {
    const { error } = resetPasswordSchema.validate({
      email: 'admin@example.com',
      otp: '123456',
      newPassword: 'Aa1@abc',
      confirmNewPassword: 'Aa1@abc',
    });

    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('at least 8 characters');
  });

  it('rejects password without required strong character mix', () => {
    const { error } = resetPasswordSchema.validate({
      email: 'admin@example.com',
      otp: '123456',
      newPassword: 'abcdefgh',
      confirmNewPassword: 'abcdefgh',
    });

    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('must contain an uppercase letter, a lowercase letter, a number and a symbol');
  });

  it('accepts valid payload with 8-char strong password', () => {
    const { error, value } = resetPasswordSchema.validate({
      email: 'admin@example.com',
      otp: '123456',
      newPassword: 'Aa1@abcd',
      confirmNewPassword: 'Aa1@abcd',
    });

    expect(error).toBeUndefined();
    expect(value).toEqual(expect.objectContaining({
      email: 'admin@example.com',
      otp: '123456',
      newPassword: 'Aa1@abcd',
      confirmNewPassword: 'Aa1@abcd',
    }));
  });
});
