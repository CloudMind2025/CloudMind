$(document).ready(function () {

  function validateTitle() {
    const title = $("#title").val().trim();
    if (!title) return setError("#title", "Título é obrigatório.");
    if (title.length < 10 || title.length > 40) return setError("#title", "Título deve ter entre 10 e 40 caracteres.");
    clearError("#title");
    return true;
  }

  function validateCategory() {
    const category = $("#category").val();
    if (!category || category === "") return setError("#category", "Selecione uma categoria válida.");
    clearError("#category");
    return true;
  }

  function validateSKU() {
    const sku = $("#sku").val().trim();
    if (sku) {
      const skuRegex = /^[a-zA-Z0-9]{3,20}$/;
      if (!skuRegex.test(sku)) return setError("#sku", "SKU deve ter 3–20 caracteres alfanuméricos (sem símbolos).");
    }
    clearError("#sku");
    return true;
  }

  function validatePrice() {
    let priceRaw = $("#price").val().trim().replace(".", "").replace(",", ".");
    const price = parseFloat(priceRaw);
    if (!priceRaw || isNaN(price) || price < 0.01 || price > 999999.99) return setError("#price", "Preço inválido (0,01 a 999.999,99).");
    clearError("#price");
    return true;
  }

  function validateImage() {
    const input = document.getElementById('images');
    if (!input.files || !input.files[0]) return setError("#images", "Selecione a imagem do produto.");
    clearError("#images");
    return true;
  }

  function validateType() {
    const type = $("#type").val();
    if (!type || type === "") return setError("#type", "Selecione o tipo de produto.");
    clearError("#type");
    return true;
  }

  function validateShortDesc() {
    const shortDesc = $("#short-desc").val().trim();
    if (shortDesc) {
      if (shortDesc.length < 10 || shortDesc.length > 30) return setError("#short-desc", "Resumo deve ter entre 10 e 30 caracteres.");
    }
    clearError("#short-desc");
    return true;
  }

  function validateDescription() {
    const description = $("#description").val().trim();
    if (!description) return setError("#description", "Descrição é obrigatória.");
    if (description.length < 20 || description.length > 2000) return setError("#description", "Descrição deve ter entre 20 e 2000 caracteres.");
    clearError("#description");
    return true;
  }

  function setError(input, message) {
    let errorElem = $(input).next(".error-message");
    if (!errorElem.length) {
      errorElem = $('<small class="error-message" style="color:red; display:block; margin-top:5px;"></small>');
      $(input).after(errorElem);
    }
    errorElem.text(message);
    return false;
  }

  function updateSummary() {
    let priceRaw = $("#price").val().trim().replace('.', '').replace(',', '.');
    const price = parseFloat(priceRaw);
    $("#summary-price").text(isNaN(price) ? '0,00' : price.toFixed(2).replace('.', ','));
    const stock = parseInt($("#stock").val(), 10);
    $("#summary-stock").text(!isNaN(stock) ? stock : '0');
  }

  function previewImage() {
    const input = document.getElementById('images');
    const preview = document.getElementById('preview-gallery');
    preview.innerHTML = '';
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.alt = 'Pré-visualização da imagem do produto';
      img.style.maxWidth = '100%';
      img.style.borderRadius = '10px';
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  }

  function clearError(input) {
    $(input).next(".error-message").remove();
  }

  $("#title").on("input blur", function () { validateTitle(); updateSummary(); });
  $("#category").on("change blur", validateCategory);
  $("#sku").on("input blur", validateSKU);
  $("#price").on("input blur", function () { validatePrice(); updateSummary(); });
  $("#stock").on("input blur change", updateSummary);
  $("#short-desc").on("input blur", validateShortDesc);
  $("#description").on("input blur", validateDescription);
  $("#images").on('change', previewImage);

  $("#product-form").on("submit", function (e) {
    e.preventDefault();
    const valid = validateTitle() && validateCategory() && validateSKU() && validatePrice() && validateShortDesc() && validateDescription() && validateImage() && validateType();
    if (valid) this.submit();
  });

  updateSummary();
});


