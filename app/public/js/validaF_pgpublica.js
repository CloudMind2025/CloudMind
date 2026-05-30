$(document).ready(function() {

  const $form = $('.public-form');

  $('#nome-publico').on('input blur', validateNomePublico);
  $('#redes').on('input blur', validateRedes);
  $('#bio').on('input blur', validateBio);

  $form.on('submit', function(e) {
    e.preventDefault();

    const validNome = validateNomePublico();
    const validRedes = validateRedes();
    const validBio = validateBio();

  });

});
function validateNomePublico() {
  const $input = $('#nome-publico');
  const value = $input.val().trim();
  const regex = /^[A-Za-zÀ-ÿ\s]+$/; 

  if (!value) return showError($input, 'Nome público é obrigatório');
  if (value.length < 10) return showError($input, 'Nome público deve ter pelo menos 10 caracteres');
  if (value.length > 30) return showError($input, 'Máximo de 30 caracteres');
  if (!regex.test(value)) return showError($input, 'Nome público não pode conter números ou símbolos');
  return showSuccess($input);
}

function validateRedes() {
  const $input = $('#redes');
  const value = $input.val().trim();
  const linkRegex = /^(https?:\/\/)?([\w\-]+\.)+[\w]{2,}(\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/i;

  if (value === '') return showSuccess($input); 
  if (!value.includes('@') && !linkRegex.test(value)) return showError($input, 'Insira um @ ou link válido');
  return showSuccess($input);
}
function validateBio() {
  const $input = $('#bio');
  const value = $input.val().trim();

  if (value.length > 300) return showError($input, 'Biografia deve ter no máximo 300 caracteres');
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
