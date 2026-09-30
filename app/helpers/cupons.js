const REGEX_CODIGO = /^[A-Z0-9_-]{3,30}$/;
const TIPOS = ['percentual', 'fixo'];
const LIMITE_FIXO = 99999.99;
const LIMITE_USOS = 1000000;
const FUSO = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

const STATUS = {
    ativo:    { rotulo: 'Ativo',    classe: 'cm-badge--ok' },
    agendado: { rotulo: 'Agendado', classe: 'cm-badge--info' },
    inativo:  { rotulo: 'Inativo',  classe: '' },
    expirado: { rotulo: 'Expirado', classe: 'cm-badge--aviso' },
    esgotado: { rotulo: 'Esgotado', classe: 'cm-badge--erro' }
};

function hoje(agora = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

function minutosDoFuso(agora = new Date(), fuso = FUSO) {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit' }).formatToParts(agora).forEach(x => { p[x.type] = Number(x.value); });
    const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    return Math.round((local - Math.floor(agora.getTime() / 60000) * 60000) / 60000);
}

function dataBR(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function normalizarCodigo(valor) {
    return String(valor == null ? '' : valor).toUpperCase().replace(/\s+/g, '');
}

function lerNumero(valor) {
    let v = String(valor == null ? '' : valor).trim().replace(/R\$|%|\s/g, '');
    if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
    return /^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : NaN;
}

const centavos = valor => Math.round(Number(valor) * 100);
const reais = c => Number((c / 100).toFixed(2));

function status(cupom, dia = hoje()) {
    if (!cupom || !Number(cupom.ativo)) return 'inativo';
    if (dia > cupom.data_fim) return 'expirado';
    if (cupom.limite_usos != null && Number(cupom.usos) >= Number(cupom.limite_usos)) return 'esgotado';
    if (dia < cupom.data_inicio) return 'agendado';
    return 'ativo';
}

function formatarReais(valor) {
    return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rotuloDesconto(cupom) {
    const v = Number(cupom.valor_desconto);
    if (cupom.tipo_desconto === 'percentual') {
        return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% OFF`;
    }
    return `${formatarReais(v)} OFF`;
}

function usosRestantes(cupom) {
    return cupom.limite_usos == null ? null : Math.max(0, Number(cupom.limite_usos) - Number(cupom.usos || 0));
}

// ---------- Formulário do ADM ----------
function validarDadosAdmin(entrada, { dia = hoje(), usosAtuais = 0, criadoresValidos = null, edicao = false } = {}) {
    const erros = [];
    const codigo = normalizarCodigo(entrada.codigo);
    if (!codigo) erros.push('Informe o código do cupom.');
    else if (!REGEX_CODIGO.test(codigo)) erros.push('O código deve ter de 3 a 30 caracteres: letras, números, hífen ou sublinhado (sem espaços nem acentos).');

    const id_criador = Number.parseInt(entrada.id_criador, 10);
    if (!Number.isInteger(id_criador) || id_criador < 1 || (criadoresValidos && !criadoresValidos.has(id_criador))) {
        erros.push('Escolha o vendedor que vai receber o cupom.');
    }

    const tipo = TIPOS.includes(entrada.tipo_desconto) ? entrada.tipo_desconto : null;
    if (!tipo) erros.push('Escolha o tipo de desconto (porcentagem ou valor fixo).');
    const valor = lerNumero(entrada.valor_desconto);
    if (tipo === 'percentual' && !(valor >= 1 && valor <= 100)) erros.push('A porcentagem deve ser de 1% a 100%.');
    if (tipo === 'fixo' && !(valor >= 0.01 && valor <= LIMITE_FIXO)) erros.push('O valor fixo deve ser de R$ 0,01 a R$ 99.999,99.');

    const dataValida = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
    const inicio = String(entrada.data_inicio || '');
    const fim = String(entrada.data_fim || '');
    if (!dataValida(inicio)) erros.push('Informe a data de início da validade.');
    if (!dataValida(fim)) erros.push('Informe a data de fim da validade.');
    if (dataValida(inicio) && dataValida(fim) && fim < inicio) erros.push('A data de fim não pode ser antes da data de início.');
    if (!edicao && dataValida(fim) && fim < dia) erros.push('A data de fim já passou: escolha uma data a partir de hoje.');

    const ilimitado = entrada.ilimitado === 'on' || entrada.ilimitado === '1' || entrada.ilimitado === true;
    let limite = null;
    if (!ilimitado) {
        limite = /^\d+$/.test(String(entrada.limite_usos || '').trim()) ? Number(entrada.limite_usos) : NaN;
        if (!(limite >= 1 && limite <= LIMITE_USOS)) erros.push('Informe o limite de usos (1 ou mais) ou marque "Uso ilimitado".');
        else if (limite < usosAtuais) erros.push(`O limite não pode ser menor que os ${usosAtuais} usos já realizados.`);
    }

    return {
        erros,
        dados: {
            codigo, id_criador, tipo_desconto: tipo, valor_desconto: valor,
            data_inicio: inicio, data_fim: fim, limite_usos: limite,
            ativo: entrada.ativo === 'on' || entrada.ativo === '1' || entrada.ativo === true
        }
    };
}

// ---------- Cálculo do desconto ----------
function calcularDesconto(cupom, itens) {
    const lista = (itens || []).map(i => ({ ...i, centavos: centavos(i.preco) }));
    const elegiveis = lista.filter(i => Number(i.id_criador) === Number(cupom.id_criador));
    const subtotal = lista.reduce((s, i) => s + i.centavos, 0);
    const subtotalElegivel = elegiveis.reduce((s, i) => s + i.centavos, 0);

    let total = 0;
    if (subtotalElegivel > 0) {
        total = cupom.tipo_desconto === 'percentual'
            ? Math.round(subtotalElegivel * Number(cupom.valor_desconto) / 100)
            : Math.min(centavos(cupom.valor_desconto), subtotalElegivel);
    }

    const porItem = new Map(elegiveis.map(i => [i.id_produto, 0]));
    let distribuido = 0;
    elegiveis.forEach(i => {
        const parte = Math.min(i.centavos, Math.floor(total * i.centavos / subtotalElegivel));
        porItem.set(i.id_produto, parte);
        distribuido += parte;
    });
    const ordem = [...elegiveis].sort((a, b) => b.centavos - a.centavos);
    for (let k = 0; distribuido < total && k < total * 2 + ordem.length; k++) {
        const i = ordem[k % ordem.length];
        if (porItem.get(i.id_produto) < i.centavos) {
            porItem.set(i.id_produto, porItem.get(i.id_produto) + 1);
            distribuido++;
        }
    }

    return {
        subtotal: reais(subtotal),
        subtotalElegivel: reais(subtotalElegivel),
        desconto: reais(total),
        total: reais(subtotal - total),
        elegiveis: elegiveis.map(i => i.id_produto),
        itens: lista.map(i => {
            const d = porItem.get(i.id_produto) || 0;
            return { id_produto: i.id_produto, preco: reais(i.centavos), desconto: reais(d), precoFinal: reais(i.centavos - d) };
        })
    };
}

// ---------- Validação do uso (carrinho e checkout) ----------
function verificarUso({ cupom, itens, dia = hoje(), jaUsou = false }) {
    const falha = (motivo, erro) => ({ ok: false, motivo, erro });
    if (!cupom) return falha('inexistente', 'Cupom inválido ou indisponível.');
    if (cupom.status_criador && cupom.status_criador !== 'ativo') return falha('vendedor', 'Cupom inválido ou indisponível.');
    const st = status(cupom, dia);
    if (st === 'inativo') return falha('inativo', 'Cupom inválido ou indisponível.');
    if (st === 'expirado') return falha('expirado', 'Este cupom expirou.');
    if (st === 'esgotado') return falha('esgotado', 'Este cupom atingiu o limite de utilizações.');
    if (st === 'agendado') return falha('agendado', `Este cupom ainda não está valendo: começa em ${dataBR(cupom.data_inicio)}.`);
    if (jaUsou) return falha('usado', 'Você já usou este cupom em outra compra.');
    const calculo = calcularDesconto(cupom, itens);
    if (!calculo.elegiveis.length) {
        return falha('sem_itens', `Este cupom vale só para produtos de ${cupom.nome_criador || 'outro vendedor'}. Adicione um produto dessa loja ao carrinho.`);
    }
    if (calculo.desconto <= 0) return falha('sem_desconto', 'Cupom inválido ou indisponível.');
    return { ok: true, calculo };
}

class ErroCupom extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = 'ErroCupom';
    }
}

module.exports = {
    ErroCupom,
    STATUS,
    REGEX_CODIGO,
    hoje,
    centavos,
    reais,
    minutosDoFuso,
    dataBR,
    normalizarCodigo,
    lerNumero,
    status,
    rotuloDesconto,
    usosRestantes,
    formatarReais,
    validarDadosAdmin,
    calcularDesconto,
    verificarUso
};
