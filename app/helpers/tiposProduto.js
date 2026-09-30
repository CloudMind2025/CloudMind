const CATEGORIAS = {
    programacao:            'Programação',
    tecnologia:             'Tecnologia',
    marketing:              'Marketing',
    negocios:               'Negócios',
    financas:               'Finanças',
    desenvolvimento_pessoal: 'Desenvolvimento pessoal',
    educacao:               'Educação',
    design:                 'Design',
    saude:                  'Saúde e bem-estar',
    literatura:             'Literatura',
    psicologia:             'Psicologia',
    ficcao:                 'Ficção',
    nao_ficcao:             'Não ficção',
    biografias:             'Biografias',
    apresentacoes:          'Apresentações',
    planilhas:              'Planilhas',
    documentos:             'Documentos e currículos',
    redes_sociais:          'Redes sociais',
    sites:                  'Sites e landing pages',
    produtividade:          'Produtividade e organização',
    identidade_visual:      'Identidade visual',
    idiomas:                'Idiomas',
    fotografia:             'Fotografia e vídeo',
    icones:                 'Ícones',
    ilustracoes:            'Ilustrações',
    imagens:                'Imagens',
    videos:                 'Vídeos',
    audios:                 'Áudios e efeitos sonoros',
    fontes:                 'Fontes',
    modelos_3d:             '3D',
    ui_kits:                'UI kits e mockups',
    games:                  'Games',
    outros:                 'Outros'
};

const IDIOMAS = { pt: 'Português', en: 'Inglês', es: 'Espanhol', outro: 'Outro' };
const NIVEIS  = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado', todos: 'Todos os níveis' };
const LICENCAS = { pessoal: 'Uso pessoal', comercial: 'Uso comercial' };

const campo = {
    idioma:   (obrigatorio = true) => ({ chave: 'idioma', rotulo: 'Idioma', icone: 'fa-globe', tipo: 'select', opcoes: IDIOMAS, obrigatorio }),
    nivel:    (obrigatorio = true) => ({ chave: 'nivel', rotulo: 'Nível', icone: 'fa-signal', tipo: 'select', opcoes: NIVEIS, obrigatorio }),
    licenca:  () => ({ chave: 'licenca', rotulo: 'Licença', icone: 'fa-scale-balanced', tipo: 'select', opcoes: LICENCAS, obrigatorio: true,
                       dica: 'Uso comercial permite usar em trabalhos para clientes ou produtos vendidos.' }),
    arquivos: (obrigatorio) => ({ chave: 'qtd_arquivos', rotulo: 'Quantidade de arquivos', rotuloCurto: 'Arquivos', icone: 'fa-folder-open',
                                  tipo: 'inteiro', min: 1, max: 100000, obrigatorio })
};

const TIPOS = {
    ebook: {
        rotulo:  'Ebook',
        icone:   'fa-book',
        entrega: 'Ebook em arquivo digital para leitura',
        previa: {
            titulo: 'Prévia das páginas',
            vazio:  'O vendedor ainda não disponibilizou prévia de páginas ou sumário deste ebook.'
        },
        upload: {
            formatos: ['pdf', 'epub', 'mobi'],
            rotuloEtapa: 'Arquivo', titulo: 'Arquivo do Ebook', sub: 'Envie o arquivo completo do seu ebook.',
            rotuloDrop: 'Adicione o arquivo do Ebook'
        },
        categorias: ['programacao', 'tecnologia', 'marketing', 'negocios', 'financas', 'desenvolvimento_pessoal',
                     'educacao', 'design', 'saude', 'literatura', 'outros'],
        campos: [
            { chave: 'paginas', rotulo: 'Número de páginas', rotuloCurto: 'Páginas', icone: 'fa-file-lines', tipo: 'inteiro', min: 1, max: 10000, obrigatorio: true },
            campo.idioma(),
            campo.nivel(false)
        ]
    },
    audiobook: {
        rotulo:  'Audiobook',
        icone:   'fa-headphones',
        entrega: 'Audiobook em arquivo de áudio',
        previa: {
            titulo: 'Amostra do áudio',
            vazio:  'O vendedor ainda não disponibilizou amostra do áudio.'
        },
        upload: {
            formatos: ['mp3', 'm4a', 'm4b', 'wav', 'zip'],
            rotuloEtapa: 'Arquivo', titulo: 'Arquivo do Audiobook', sub: 'Envie o áudio completo do seu audiobook.',
            rotuloDrop: 'Adicione o arquivo de áudio'
        },
        categorias: ['desenvolvimento_pessoal', 'negocios', 'financas', 'educacao', 'psicologia', 'ficcao',
                     'nao_ficcao', 'biografias', 'saude', 'outros'],
        campos: [
            { chave: 'duracao', rotulo: 'Duração', icone: 'fa-clock', tipo: 'duracao', max: 200 * 60, obrigatorio: true },
            campo.idioma(),
            { chave: 'narrador', rotulo: 'Narrador', icone: 'fa-microphone', tipo: 'texto', min: 2, max: 80, obrigatorio: false,
              placeholder: 'Nome de quem narra' }
        ]
    },
    template: {
        rotulo:  'Template',
        icone:   'fa-layer-group',
        entrega: 'Arquivos editáveis do template',
        previa: {
            titulo: 'Arquivos incluídos',
            vazio:  'O vendedor ainda não detalhou os arquivos incluídos neste template.'
        },
        upload: {
            formatos: ['zip', 'pdf', 'docx', 'xlsx', 'pptx', 'psd', 'ai'],
            rotuloEtapa: 'Arquivos', titulo: 'Arquivos do Template', sub: 'Envie o template. Com vários arquivos, junte tudo em um ZIP.',
            rotuloDrop: 'Adicione o arquivo do Template'
        },
        categorias: ['apresentacoes', 'planilhas', 'documentos', 'redes_sociais', 'sites', 'produtividade',
                     'marketing', 'identidade_visual', 'educacao', 'outros'],
        campos: [
            { chave: 'compativel', rotulo: 'Compatível com', icone: 'fa-puzzle-piece', tipo: 'multi', obrigatorio: true,
              opcoes: { canva: 'Canva', figma: 'Figma', notion: 'Notion', excel: 'Excel', google_planilhas: 'Google Planilhas',
                        word: 'Word', google_docs: 'Google Docs', powerpoint: 'PowerPoint', photoshop: 'Photoshop',
                        illustrator: 'Illustrator', html: 'HTML/CSS', outro: 'Outro' } },
            campo.arquivos(false),
            campo.licenca()
        ]
    },
    curso: {
        rotulo:  'Curso',
        icone:   'fa-graduation-cap',
        entrega: 'Acesso ao conteúdo do curso',
        previa: {
            titulo: 'Módulos e aulas',
            vazio:  'O vendedor ainda não cadastrou a estrutura de módulos e aulas deste curso.'
        },
        upload: {
            formatos: ['zip', 'pdf', 'mp4'],
            rotuloEtapa: 'Conteúdo', titulo: 'Conteúdo do Curso', sub: 'Envie o material do seu curso. Com várias aulas, junte tudo em um ZIP.',
            rotuloDrop: 'Adicione o conteúdo do curso'
        },
        categorias: ['programacao', 'tecnologia', 'design', 'marketing', 'negocios', 'financas', 'idiomas',
                     'fotografia', 'educacao', 'desenvolvimento_pessoal', 'saude', 'outros'],
        campos: [
            { chave: 'aulas', rotulo: 'Número de aulas', rotuloCurto: 'Aulas', icone: 'fa-circle-play', tipo: 'inteiro', min: 1, max: 5000, obrigatorio: true },
            { chave: 'modulos', rotulo: 'Número de módulos', rotuloCurto: 'Módulos', icone: 'fa-list-ol', tipo: 'inteiro', min: 1, max: 500, obrigatorio: false },
            { chave: 'duracao', rotulo: 'Duração total', rotuloCurto: 'Duração', icone: 'fa-clock', tipo: 'duracao', max: 2000 * 60, obrigatorio: true },
            campo.nivel(),
            campo.idioma(),
            { chave: 'certificado', rotulo: 'Certificado do vendedor', rotuloCurto: 'Certificado', icone: 'fa-award', tipo: 'select',
              opcoes: { sim: 'Sim', nao: 'Não' }, obrigatorio: false, dica: 'Emitido por você, não pela CloudMind.' }
        ]
    },
    assets: {
        rotulo:  'Asset',
        icone:   'fa-shapes',
        entrega: 'Arquivos digitais do pacote de assets',
        previa: {
            titulo: 'Prévia dos arquivos',
            vazio:  'O vendedor ainda não disponibilizou prévias ou a lista de arquivos deste pacote.'
        },
        upload: {
            formatos: ['zip', 'rar', '7z', 'png', 'jpg', 'jpeg', 'svg', 'psd', 'ai', 'ttf', 'otf'],
            rotuloEtapa: 'Arquivos', titulo: 'Arquivos do Asset', sub: 'Envie o pacote. Com vários arquivos, junte tudo em um ZIP.',
            rotuloDrop: 'Adicione o arquivo do Asset'
        },
        categorias: ['icones', 'ilustracoes', 'imagens', 'videos', 'audios', 'fontes', 'modelos_3d', 'ui_kits', 'games', 'outros'],
        campos: [
            { chave: 'formatos', rotulo: 'Formatos incluídos', rotuloCurto: 'Formatos', icone: 'fa-file-image', tipo: 'multi', obrigatorio: true,
              opcoes: { png: 'PNG', jpg: 'JPG', svg: 'SVG', psd: 'PSD', ai: 'AI', figma: 'Figma', fontes: 'OTF/TTF',
                        audio: 'MP3/WAV', mp4: 'MP4', modelos_3d: 'OBJ/FBX/GLB', outro: 'Outro' } },
            campo.arquivos(true),
            { chave: 'resolucao', rotulo: 'Resolução / qualidade', rotuloCurto: 'Resolução', icone: 'fa-expand', tipo: 'texto', min: 2, max: 40,
              obrigatorio: false, placeholder: 'Ex.: 4K, 512 × 512 px, vetorial' },
            campo.licenca()
        ]
    }
};

const CHAVES = Object.keys(TIPOS);

function tipo(chave) {
    const k = String(chave || '').trim().toLowerCase();
    return TIPOS[k] || (k === 'asset' ? TIPOS.assets : null);
}

function categoriaPermitida(chaveTipo, slug) {
    const cfg = tipo(chaveTipo);
    return !!(cfg && slug && cfg.categorias.includes(slug));
}

// ---------- Validação de um campo ----------
function textoLimpo(v) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function validarCampo(c, entrada) {
    const vazio = entrada == null || (Array.isArray(entrada) ? entrada.every(v => textoLimpo(v) === '') : textoLimpo(entrada) === '');
    if (vazio) return c.obrigatorio ? { erro: `Preencha o campo "${c.rotulo}".` } : { valor: null };

    if (c.tipo === 'inteiro') {
        const t = textoLimpo(entrada);
        if (!/^\d+$/.test(t)) return { erro: `${c.rotulo}: use um número inteiro.` };
        const n = Number(t);
        if (n < c.min || n > c.max) return { erro: `${c.rotulo}: use um número de ${c.min} a ${c.max.toLocaleString('pt-BR')}.` };
        return { valor: n };
    }
    if (c.tipo === 'duracao') {
        const m = /^(\d{1,4}):([0-5]\d)$/.exec(textoLimpo(entrada));
        if (!m) return { erro: `${c.rotulo}: use horas:minutos, ex.: 5:32.` };
        const minutos = Number(m[1]) * 60 + Number(m[2]);
        if (minutos < 1) return { erro: `${c.rotulo}: informe uma duração maior que zero.` };
        if (minutos > c.max) return { erro: `${c.rotulo}: o máximo é ${c.max / 60} horas.` };
        return { valor: minutos };
    }
    if (c.tipo === 'select') {
        const t = textoLimpo(entrada);
        return Object.prototype.hasOwnProperty.call(c.opcoes, t) ? { valor: t } : { erro: `${c.rotulo}: escolha uma opção da lista.` };
    }
    if (c.tipo === 'multi') {
        const lista = [...new Set((Array.isArray(entrada) ? entrada : [entrada]).map(textoLimpo).filter(Boolean))];
        if (lista.some(v => !Object.prototype.hasOwnProperty.call(c.opcoes, v))) return { erro: `${c.rotulo}: escolha opções da lista.` };
          return { valor: Object.keys(c.opcoes).filter(k => lista.includes(k)) };
    }
    const t = textoLimpo(entrada);
    if (t.length < c.min || t.length > c.max) return { erro: `${c.rotulo}: use de ${c.min} a ${c.max} caracteres.` };
    return { valor: t };
}

function validarDetalhes(chaveTipo, entrada) {
    const cfg = tipo(chaveTipo);
    const detalhes = {};
    const erros = [];
    if (!cfg) return { detalhes, erros };
    const dados = entrada && typeof entrada === 'object' ? entrada : {};
    cfg.campos.forEach(c => {
        const r = validarCampo(c, dados[c.chave]);
        if (r.erro) erros.push({ chave: c.chave, msg: r.erro });
        else if (r.valor !== null && !(Array.isArray(r.valor) && !r.valor.length)) detalhes[c.chave] = r.valor;
    });
    return { detalhes, erros };
}

function detalhesCompletos(chaveTipo, detalhes) {
    return validarDetalhes(chaveTipo, detalhes || {}).erros.length === 0;
}

// ---------- Exibição ----------
function formatarDuracao(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (!h) return `${m}min`;
    return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
}

function formatarValor(c, valor) {
    if (valor == null || valor === '') return null;
    if (c.tipo === 'inteiro') return Number(valor).toLocaleString('pt-BR');
    if (c.tipo === 'duracao') return formatarDuracao(Number(valor));
    if (c.tipo === 'select') return c.opcoes[valor] || null;
    if (c.tipo === 'multi') {
        const rotulos = (Array.isArray(valor) ? valor : []).map(v => c.opcoes[v]).filter(Boolean);
        return rotulos.length ? rotulos.join(', ') : null;
    }
    return String(valor);
}

function fichaDoProduto(chaveTipo, detalhes) {
    const cfg = tipo(chaveTipo);
    if (!cfg || !detalhes || typeof detalhes !== 'object') return [];
    return cfg.campos
        .map(c => ({ chave: c.chave, icone: c.icone, rotulo: c.rotuloCurto || c.rotulo, valor: formatarValor(c, detalhes[c.chave]) }))
        .filter(l => l.valor);
}

function valorParaFormulario(c, valor) {
    if (valor == null) return c.tipo === 'multi' ? [] : '';
    if (c.tipo === 'duracao' && /^\d+$/.test(String(valor))) {
        const n = Number(valor);
        return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    }
    if (c.tipo === 'multi') return Array.isArray(valor) ? valor.map(String) : [String(valor)];
    return String(valor);
}

function detalhesParaFormulario(chaveTipo, detalhes) {
    const cfg = tipo(chaveTipo);
    const valores = {};
    if (!cfg) return valores;
    const dados = detalhes && typeof detalhes === 'object' ? detalhes : {};
    cfg.campos.forEach(c => { valores[c.chave] = valorParaFormulario(c, dados[c.chave]); });
    return valores;
}

function configParaCliente(categoriasBanco) {
    const porSlug = {};
    (categoriasBanco || []).forEach(c => { if (c.slug_categoria) porSlug[c.slug_categoria] = c; });
    const tipos = {};
    CHAVES.forEach(k => {
        const t = TIPOS[k];
        tipos[k] = {
            rotulo: t.rotulo,
            icone: t.icone,
            upload: t.upload,
            categorias: t.categorias
                .filter(slug => porSlug[slug])
                .map(slug => ({ id: porSlug[slug].id_categoria, nome: porSlug[slug].nome_categoria || CATEGORIAS[slug] })),
            campos: t.campos
        };
    });
    return { tipos };
}

module.exports = {
    TIPOS,
    CHAVES,
    CATEGORIAS,
    tipo,
    categoriaPermitida,
    validarCampo,
    validarDetalhes,
    detalhesCompletos,
    fichaDoProduto,
    formatarDuracao,
    valorParaFormulario,
    detalhesParaFormulario,
    configParaCliente
};
