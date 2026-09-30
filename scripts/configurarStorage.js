const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand } = require('@aws-sdk/client-s3');
const armazenamento = require('../app/helpers/armazenamento');
const { testar } = require('./testarStorage');

const PASTAS_PUBLICAS = ['products/*/cover/*', 'products/*/gallery/*', 'users/*/avatar/*', 'sellers/*/cover/*'];

(async () => {
    if (!armazenamento.configurado()) {
        console.error('❌ Storage não configurado. Defina no .env (e no Render) as variáveis do .env.example:');
        console.error('   STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY');
        process.exit(1);
    }
    const cfg = armazenamento.config();
    const { cliente, bucket } = armazenamento.criarDriverS3(cfg);
    console.log(`Endpoint: ${cfg.endpoint}\nBucket:   ${bucket}\n`);

    try {
        await cliente.send(new HeadBucketCommand({ Bucket: bucket }));
        console.log('✔ Bucket encontrado e credenciais válidas.');
    } catch (err) {
        const status = err.$metadata && err.$metadata.httpStatusCode;
        if (status === 404 || err.name === 'NotFound' || err.name === 'NoSuchBucket') {
            await cliente.send(new CreateBucketCommand({ Bucket: bucket }));
            console.log('✔ Bucket criado.');
        } else {
            console.error(`❌ Não foi possível acessar o bucket (HTTP ${status || '?'}: ${err.name}). Confira endpoint, chave e segredo.`);
            process.exit(1);
        }
    }

    const politica = {
        Version: '2012-10-17',
        Statement: [{
            Sid: 'LeituraPublicaDasImagens',
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: PASTAS_PUBLICAS.map(p => `arn:aws:s3:::${bucket}/${p}`)
        }]
    };
    try {
        await cliente.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(politica) }));
        console.log('✔ Política aplicada: leitura pública só nas pastas de imagens (arquivos de produto continuam privados).');
    } catch (err) {
        console.warn(`⚠️  A política do bucket não foi aceita (${err.name}). As imagens ainda ficam públicas pela ACL de cada objeto.`);
    }

    console.log('\nTestando o storage de ponta a ponta:');
    process.exitCode = await testar();
})().catch(err => {
    console.error('❌', err.message);
    process.exitCode = 1;
});
