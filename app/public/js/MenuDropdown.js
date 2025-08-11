// Abrir e fechar menu no mobile

const menuHam = document.getElementById('menu-icon');
const menuCenter = document.querySelector('.menu-center');

menuHam.addEventListener('click', () => {
    menuCenter.classList.toggle('active');
});




/*   MENU DROPDOWN ( OUTDATED )


// Dropdown sem hover ( por click ) 
//click 1: abre dropdown
//click 2: vai para o link ( loja )


const dropdownToggles = document.querySelectorAll('.dropdown-toggle');

dropdownToggles.forEach(toggle => {
    let PClick = false;

    toggle.addEventListener('click', (e) => {
        const dropdown = toggle.nextElementSibling;

        // Primeiro click: abre dropdown e cancela o link da loja
        if (!PClick) {
            e.preventDefault();
            // Fecha outros dropdowns
            document.querySelectorAll('.dropdown').forEach(menu => {
                if (menu !== dropdown) menu.classList.remove('show');
            });
            dropdown.classList.toggle('show');
            PClick = true;

            // Reset após 2s
            setTimeout(() => PClick = false, 1500);
        }
        // Segundo click: direciona para o link normalmente
    });
});

// Fecha dropdown se clicar fora

document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-center') && !e.target.closest('.dropdown')){
        document.querySelectorAll('.dropdown').forEach(menu => {
            menu.classList.remove('show');
        });
    }
}); 





                ( END OF MENU DROPDOWN ( OUTDATED )) */