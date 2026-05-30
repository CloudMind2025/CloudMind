$(document).ready(function () {
  const $form = $('.ticket-form');
  if ($form.length === 0) return;

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

  function validateCategory() {
    const $select = $form.find('select[name="tipo_chamada"]');
    if (!$select.val() || $select.val() === '') {
      return showError($select, 'Selecione uma categoria');
    }
    return showSuccess($select);
  }

  function validateMessage() {
    const $textarea = $form.find('textarea[name="descricao"]');
    const value = $textarea.val().trim();
    if (value === '') {
      return showError($textarea, 'A mensagem é obrigatória');
    }
    if (value.length < 20) {
      return showError($textarea, 'A mensagem deve ter no mínimo 20 caracteres');
    }
    if (value.length > 1000) {
      return showError($textarea, 'A mensagem deve ter no máximo 1000 caracteres');
    }
    return showSuccess($textarea);
  }

  $form.find('select[name="tipo_chamada"]').on('change blur', validateCategory);
  $form.find('textarea[name="descricao"]').on('input blur', validateMessage);

  $form.on('submit', function (e) {
    e.preventDefault();
    const valid1 = validateCategory();
    const valid2 = validateMessage();
    if (valid1 && valid2) {
      $form.off('submit');
      $form.submit();
    }
  });
});
