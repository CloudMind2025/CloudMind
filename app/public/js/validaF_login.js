$(document).ready(function() {

  $('#email').on('input blur', function() {
    validateEmail();
  });

  $('#password').on('input blur', function() {
    validatePassword();
  });

  $('form').on('submit', function(e) {
    e.preventDefault(); // Impede envio imediato para validar primeiro

    const isEmailValid    = validateEmail();
    const isPasswordValid = validatePassword();

    if (isEmailValid && isPasswordValid) {
      $('form')[0].submit(); // Envia o formulário de verdade para o servidor
    }
  });
});

function validateEmail() {
  const email = $('#email').val().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email === '') {
    showError('email', 'E-mail é obrigatório');
    return false;
  } else if (!emailRegex.test(email)) {
    showError('email', 'E-mail inválido (deve conter @)');
    return false;
  } else {
    showSuccess('email');
    return true;
  }
}

function validatePassword() {
  const password = $('#password').val();

  if (password === '') {
    showError('password', 'Senha é obrigatória');
    return false;
  } else if (password.length < 8) {
    showError('password', 'A senha deve ter pelo menos 8 caracteres');
    return false;
  } else {
    showSuccess('password');
    return true;
  }
}

function showError(field, message) {
  const input = $(`#${field}`);
  let errorEl = input.next('.error-message');

  if (errorEl.length === 0) {
    errorEl = $('<span class="error-message"></span>');
    input.after(errorEl);
  }

  input.addClass('error').removeClass('success');
  errorEl.text(message).show();
}

function showSuccess(field) {
  const input = $(`#${field}`);
  const errorEl = input.next('.error-message');

  input.addClass('success').removeClass('error');
  if (errorEl.length) {
    errorEl.fadeOut(200);
  }
}
