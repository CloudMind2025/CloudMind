const test = require('node:test');
const assert = require('node:assert/strict');
const cupons = require('../app/helpers/cupons');

const DIA = '2026-09-26';
const base = { id_cupom: 1, codigo: 'JOAO10', id_criador: 7, nome_criador: 'João Martins', status_criador: 'ativo',
    tipo_desconto: 'percentual', valor_desconto: 10, data_inicio: '2026-09-01', data_fim: '2026-10-30',
    limite_usos: 100, usos: 0, ativo: true };
const carrinhoMisto = [
    { id_produto: 1, preco: 100, id_criador: 7 },
    { id_produto: 2, preco: 100, id_criador: 8 }
];

test('código: maiúsculas, sem espaços', () => {
    assert.equal(cupons.normalizarCodigo('  joao 10 '), 'JOAO10');
    assert.ok(cupons.REGEX_CODIGO.test('BLACK-FRIDAY_2026'));
    assert.ok(!cupons.REGEX_CODIGO.test('AÇÃO'));
});

test('status calculado: ativo, agendado, expirado, esgotado e inativo', () => {
    assert.equal(cupons.status(base, DIA), 'ativo');
    assert.equal(cupons.status({ ...base, data_inicio: '2026-10-01' }, DIA), 'agendado');
    assert.equal(cupons.status({ ...base, data_fim: '2026-09-25' }, DIA), 'expirado');
    assert.equal(cupons.status({ ...base, data_fim: DIA }, DIA), 'ativo', 'vale até o fim do último dia');
    assert.equal(cupons.status({ ...base, limite_usos: 5, usos: 5 }, DIA), 'esgotado');
    assert.equal(cupons.status({ ...base, limite_usos: null, usos: 9999 }, DIA), 'ativo', 'ilimitado nunca esgota');
    assert.equal(cupons.status({ ...base, ativo: false }, DIA), 'inativo');
});

test('cenários 12 e 14: percentual só nos produtos do vendedor do cupom', () => {
    const r = cupons.calcularDesconto(base, carrinhoMisto);
    assert.equal(r.subtotal, 200);
    assert.equal(r.desconto, 10);
    assert.equal(r.total, 190);
    assert.deepEqual(r.elegiveis, [1]);
    assert.equal(r.itens.find(i => i.id_produto === 2).desconto, 0, 'produto de outro vendedor sem desconto');
});

test('cenário 13: valor fixo, limitado ao valor dos produtos do vendedor', () => {
    const fixo = { ...base, tipo_desconto: 'fixo', valor_desconto: 20 };
    assert.equal(cupons.calcularDesconto(fixo, carrinhoMisto).desconto, 20);
    const grande = cupons.calcularDesconto({ ...fixo, valor_desconto: 500 }, carrinhoMisto);
    assert.equal(grande.desconto, 100, 'nunca passa do subtotal elegível');
    assert.equal(grande.total, 100);
    assert.ok(grande.itens.every(i => i.precoFinal >= 0));
});

test('rateio: centavos não somem nem sobram entre vários itens', () => {
    const itens = [{ id_produto: 1, preco: 33.33, id_criador: 7 }, { id_produto: 2, preco: 33.33, id_criador: 7 }, { id_produto: 3, preco: 33.34, id_criador: 7 }];
    const r = cupons.calcularDesconto({ ...base, tipo_desconto: 'fixo', valor_desconto: 10 }, itens);
    assert.equal(Math.round(r.itens.reduce((s, i) => s + i.desconto * 100, 0)), 1000);
    assert.equal(r.total, 90);
});

test('cenários 8–11: uso bloqueado com a mensagem certa', () => {
    const uso = (cupom, extra = {}) => cupons.verificarUso({ cupom, itens: carrinhoMisto, dia: DIA, ...extra });
    assert.equal(uso(null).erro, 'Cupom inválido ou indisponível.');
    assert.equal(uso({ ...base, ativo: false }).erro, 'Cupom inválido ou indisponível.');
    assert.equal(uso({ ...base, data_fim: '2026-09-01' }).erro, 'Este cupom expirou.');
    assert.equal(uso({ ...base, limite_usos: 3, usos: 3 }).erro, 'Este cupom atingiu o limite de utilizações.');
    assert.match(uso({ ...base, data_inicio: '2026-12-01' }).erro, /começa em 01\/12\/2026/);
    assert.equal(uso(base, { jaUsou: true }).erro, 'Você já usou este cupom em outra compra.');
    assert.equal(uso({ ...base, status_criador: 'suspenso' }).erro, 'Cupom inválido ou indisponível.');
    const outroVendedor = cupons.verificarUso({ cupom: { ...base, id_criador: 9, nome_criador: 'Ana' }, itens: carrinhoMisto, dia: DIA });
    assert.match(outroVendedor.erro, /vale só para produtos de Ana/);
    assert.equal(uso(base).ok, true);
});

test('formulário do ADM: validações e limites', () => {
    const validos = new Set([7, 8]);
    const ok = cupons.validarDadosAdmin({ codigo: 'joao 10', id_criador: '7', tipo_desconto: 'percentual', valor_desconto: '10',
        data_inicio: DIA, data_fim: '2026-10-30', limite_usos: '100', ativo: 'on' }, { dia: DIA, criadoresValidos: validos });
    assert.deepEqual(ok.erros, []);
    assert.equal(ok.dados.codigo, 'JOAO10');
    assert.equal(ok.dados.ativo, true);

    const fixo = cupons.validarDadosAdmin({ codigo: 'JOAO20', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '1.500,50',
        data_inicio: DIA, data_fim: DIA, ilimitado: 'on' }, { dia: DIA, criadoresValidos: validos });
    assert.deepEqual(fixo.erros, []);
    assert.equal(fixo.dados.valor_desconto, 1500.5);
    assert.equal(fixo.dados.limite_usos, null, 'uso ilimitado');

    const ruim = cupons.validarDadosAdmin({ codigo: 'x', id_criador: '99', tipo_desconto: 'percentual', valor_desconto: '150',
        data_inicio: '2026-10-10', data_fim: '2026-10-01', limite_usos: '0' }, { dia: DIA, criadoresValidos: validos });
    assert.equal(ruim.erros.length, 5);

    const passado = cupons.validarDadosAdmin({ codigo: 'VELHO', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '5',
        data_inicio: '2026-01-01', data_fim: '2026-02-01', ilimitado: 'on' }, { dia: DIA, criadoresValidos: validos });
    assert.match(passado.erros.join(' '), /já passou/);

    const limiteMenor = cupons.validarDadosAdmin({ codigo: 'JOAO10', id_criador: '7', tipo_desconto: 'fixo', valor_desconto: '5',
        data_inicio: DIA, data_fim: DIA, limite_usos: '2' }, { dia: DIA, criadoresValidos: validos, usosAtuais: 3, edicao: true });
    assert.match(limiteMenor.erros.join(' '), /menor que os 3 usos/);
});

test('rótulos e datas', () => {
    assert.equal(cupons.rotuloDesconto(base), '10% OFF');
    assert.equal(cupons.rotuloDesconto({ tipo_desconto: 'percentual', valor_desconto: 12.5 }), '12,5% OFF');
    assert.equal(cupons.rotuloDesconto({ tipo_desconto: 'fixo', valor_desconto: 20 }), 'R$ 20,00 OFF');
    assert.equal(cupons.dataBR('2026-10-30'), '30/10/2026');
    assert.match(cupons.hoje(), /^\d{4}-\d{2}-\d{2}$/);
});

test('fuso: dia de Brasília mesmo com o servidor/banco em UTC', () => {
    const noite = new Date('2026-09-26T01:30:00Z');
    assert.equal(cupons.minutosDoFuso(noite, 'America/Sao_Paulo'), -180);
    assert.equal(cupons.minutosDoFuso(noite, 'UTC'), 0);
    assert.equal(cupons.minutosDoFuso(noite, 'Asia/Kolkata'), 330);
    assert.equal(cupons.hoje(noite), '2026-09-25');
});
