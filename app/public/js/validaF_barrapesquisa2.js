document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.querySelector(".search-bar input[type='text']");
  if (!searchInput) return;

  // Lista de produtos cadastrados (pode ser carregada dinamicamente)
  const products = [
    "Ebook: Front-end para Iniciantes",
    "Template: Pitch Deck Moderno",
    "Flashcards – Biologia ENEM",
    "Curso de Programação",
    "Ebook:Domine o Front-End",
    
  ];

  const suggestionBox = document.createElement("ul");
  suggestionBox.classList.add("search-suggestions");
  suggestionBox.style.position = "absolute";
  suggestionBox.style.top = `${searchInput.offsetHeight}px`;
  suggestionBox.style.left = "0";
  suggestionBox.style.width = "100%";
  suggestionBox.style.zIndex = "1000";
  searchInput.parentElement.style.position = "relative";
  searchInput.parentElement.appendChild(suggestionBox);

  let currentFocus = -1;

  function updateSuggestions() {
    let value = searchInput.value.slice(0, 200).toLowerCase();
    searchInput.value = value;

    suggestionBox.innerHTML = "";
    currentFocus = -1;

    if (!value) {
      suggestionBox.style.display = "none";
      return;
    }

    // Mostrar apenas produtos que começam com o valor digitado
    const filtered = products.filter(prod => prod.toLowerCase().startsWith(value));

    filtered.forEach(prod => {
      const li = document.createElement("li");
      li.textContent = prod;
      li.tabIndex = 0;
      li.addEventListener("click", () => {
        searchInput.value = prod;
        suggestionBox.style.display = "none";
      });
      suggestionBox.appendChild(li);
    });

    suggestionBox.style.display = filtered.length ? "block" : "none";
  }

  searchInput.addEventListener("input", updateSuggestions);

  searchInput.addEventListener("keydown", (e) => {
    const items = suggestionBox.querySelectorAll("li");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      currentFocus = (currentFocus + 1) % items.length;
      setActive(items);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      currentFocus = (currentFocus - 1 + items.length) % items.length;
      setActive(items);
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (currentFocus > -1) {
        items[currentFocus].click();
        e.preventDefault();
      }
    }
  });

  function setActive(items) {
    items.forEach(item => item.classList.remove("active"));
    if (currentFocus > -1) items[currentFocus].classList.add("active");
  }

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !suggestionBox.contains(e.target)) {
      suggestionBox.style.display = "none";
    }
  });

  window.addEventListener("resize", () => {
    suggestionBox.style.top = `${searchInput.offsetHeight}px`;
    suggestionBox.style.width = `${searchInput.offsetWidth}px`;
  });
});
