// js/validators.js

export const validators = {
  /**
   * Verifica si un email es válido.
   */
  isValidEmail: (email) => {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email).toLowerCase().trim());
  },

  /**
   * Verifica que un campo de texto no esté vacío.
   */
  isNotEmpty: (text) => {
    return text && text.trim().length > 0;
  },

  /**
   * Verifica la longitud mínima de la contraseña (6 caracteres).
   */
  isValidPassword: (password) => {
    return password && password.length >= 6;
  },

  /**
   * Verifica que dos contraseñas coincidan.
   */
  passwordsMatch: (pass1, pass2) => {
    return pass1 === pass2;
  },

  /**
   * Verifica que una fecha no esté en el pasado.
   */
  isDateInFuture: (dateString) => {
    if (!dateString) return false;
    try {
      const inputDate = new Date(dateString);
      const now = new Date();
      return inputDate > now;
    } catch (e) {
      return false;
    }
  }
};