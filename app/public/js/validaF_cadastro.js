$(document).ready(function() {

  const $form = $('form');
  const $inputs = $form.find('input');

  $inputs.on('input blur', function() {
    const id = $(this).attr('id');
    switch (id) {
      case 'name': validateName(); break;
      case 'email': validateEmail(); break;
      case 'cpf': validateCPF(); break;
      case 'password': validatePassword(); break;
      case 'confirm-password': validateConfirmPassword(); break;
    }
  });

  $form.on('submit', function(e) {
    e.preventDefault();

    const tipoConta = $('input[name="tipo_conta"]:checked').val();
    const precisaCpf = tipoConta === 'cliente' || tipoConta === 'vendedor';

    const validName    = validateName();
    const validEmail   = validateEmail();
    const validCPF     = precisaCpf ? validateCPF() : true;
    const validPassword = validatePassword();
    const validConfirm = validateConfirmPassword();

    if (validName && validEmail && validCPF && validPassword && validConfirm) {
      if (precisaCpf) {
        $('#cpf').val($('#cpf').val().replace(/\D/g, ''));
      }
      $form[0].submit();
    }
  });

  $('#cpf').on('input', function() {
    let value = $(this).val().replace(/\D/g, '').slice(0,11); 
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    $(this).val(value);
  });

});

function validateName() {
  const $input = $('#name');
  const value = $input.val().trim();
  if (!value) return showError($input, 'Nome é obrigatório');
  return showSuccess($input);
}

function validateEmail() {
  const $input = $('#email');
  const email = $input.val().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email === '') {
    return showError($input, 'E-mail é obrigatório');
  } else if (!emailRegex.test(email)) {
    return showError($input, 'E-mail inválido (deve conter @)');
  } else {
    return showSuccess($input);
  }
}

function validateCPF() {
  const $input = $('#cpf');
  const raw = ($input.val() || '').replace(/\D/g, '');
  if (!raw) return showError($input, 'CPF é obrigatório');
  if (raw.length !== 11) return showError($input, 'CPF deve ter 11 dígitos');

  if (/^(\d)\1{10}$/.test(raw)) return showError($input, 'CPF inválido');

  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(raw.substring(i - 1, i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(raw.substring(9, 10), 10)) return showError($input, 'CPF inválido');

  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(raw.substring(i - 1, i), 10) * (12 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(raw.substring(10, 11), 10)) return showError($input, 'CPF inválido');

  return showSuccess($input);
}

function validatePassword() {
  const $input = $('#password');
  const password = $input.val();

  const hasUpper  = /[A-Z]/.test(password);
  const hasLower  = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (password === '')       return showError($input, 'Senha é obrigatória');
  if (password.length < 8)   return showError($input, 'A senha deve ter pelo menos 8 caracteres');
  if (!hasUpper)             return showError($input, 'A senha deve conter pelo menos uma letra maiúscula');
  if (!hasLower)             return showError($input, 'A senha deve conter pelo menos uma letra minúscula');
  if (!hasNumber)            return showError($input, 'A senha deve conter pelo menos um número');
  if (!hasSymbol)            return showError($input, 'A senha deve conter pelo menos um símbolo (ex: !@#$%)');

  return showSuccess($input);
}

function validateConfirmPassword() {
  const $input = $('#confirm-password');
  const value = $input.val();
  const password = $('#password').val();

  if (!value) return showError($input, 'Confirme sua senha');
  if (value !== password) return showError($input, 'Senhas não coincidem');
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
