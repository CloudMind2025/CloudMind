$(document).ready(function () {

  const $form = $('.dados-form');

  $('#nome').on('input blur', validateNome);
  $('#email').on('input blur', validateEmail);

  $form.on('submit', function (e) {
    const validNome  = validateNome();
    const validEmail = validateEmail();
    if (!validNome || !validEmail) {
      e.preventDefault();
    }
    // se válido, o form envia normalmente para o servidor
  });

});

function validateNome() {
  const $input = $('#nome');
  const value  = $input.val().trim();

  if (!value)              return showError($input, 'Nome é obrigatório');
  if (value.length < 10)  return showError($input, 'Nome deve ter pelo menos 10 caracteres');
  if (value.length > 50)  return showError($input, 'Nome deve ter no máximo 50 caracteres');
  return showSuccess($input);
}

function validateEmail() {
  const $input     = $('#email');
  const email      = $input.val().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email)                   return showError($input, 'E-mail é obrigatório');
  if (!emailRegex.test(email))  return showError($input, 'E-mail inválido (deve conter @)');
  return showSuccess($input);
}

function showError($input, message) {
  let $error = $input.next('.error-message');
  if ($error.length === 0) {
    $error = $('<span class="error-message"></span>');
    $input.after($error);
  }
  $input.addClass('error').removeClass('success');
  $error.text(message).show();
  return false;
}

function showSuccess($input) {
  const $error = $input.next('.error-message');
  $input.addClass('success').removeClass('error');
  if ($error.length) $error.fadeOut(200);
  return true;
}
