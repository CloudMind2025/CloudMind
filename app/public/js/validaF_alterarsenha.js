$(document).ready(function () {

  const $form = $('.password-form');

  $('#senha_atual').on('input blur', validateSenhaAtual);
  $('#nova_senha').on('input blur', validateNovaSenha);
  $('#confirmar_senha').on('input blur', validateConfirmarSenha);

  $form.on('submit', function (e) {
    const valid1 = validateSenhaAtual();
    const valid2 = validateNovaSenha();
    const valid3 = validateConfirmarSenha();
    if (!valid1 || !valid2 || !valid3) {
      e.preventDefault();
    }
    // se válido, o form envia normalmente para o servidor
  });

});

function validateSenhaAtual() {
  const $input = $('#senha_atual');
  const value  = $input.val().trim();

  if (!value)             return showError($input, 'Senha atual é obrigatória');
  if (value.length < 8)  return showError($input, 'A senha deve ter pelo menos 8 caracteres');
  return showSuccess($input);
}

function validateNovaSenha() {
  const $input   = $('#nova_senha');
  const password = $input.val().trim();

  if (!password)              return showError($input, 'Nova senha é obrigatória');
  if (password.length < 8)   return showError($input, 'A nova senha deve ter pelo menos 8 caracteres');
  if (!/[A-Z]/.test(password)) return showError($input, 'Inclua pelo menos uma letra maiúscula');
  if (!/[a-z]/.test(password)) return showError($input, 'Inclua pelo menos uma letra minúscula');
  if (!/[0-9]/.test(password)) return showError($input, 'Inclua pelo menos um número');
  if (!/[^A-Za-z0-9]/.test(password)) return showError($input, 'Inclua pelo menos um símbolo (ex: !@#$%)');
  return showSuccess($input);
}

function validateConfirmarSenha() {
  const $input   = $('#confirmar_senha');
  const confirm  = $input.val().trim();
  const novaSenha = $('#nova_senha').val().trim();

  if (!confirm)               return showError($input, 'Confirmação de senha é obrigatória');
  if (confirm !== novaSenha)  return showError($input, 'As senhas não coincidem');
  return showSuccess($input);
}

function showError($input, message) {
  $input.addClass('input-error');
  let $error = $input.siblings('.error-message');
  if ($error.length === 0) {
    $error = $('<div class="error-message"></div>');
    $input.after($error);
  }
  $error.text(message).show();
  return false;
}

function showSuccess($input) {
  $input.removeClass('input-error');
  $input.siblings('.error-message').hide();
  return true;
}
