const nodemailer = require('nodemailer');

const emailUser = (process.env.EMAIL_USER || '').trim();
const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '').trim();
const emailHost = (process.env.EMAIL_HOST || 'smtp-relay.brevo.com').trim();
const emailPort = parseInt(process.env.EMAIL_PORT || '587', 10);
// EMAIL_FROM = email verificado no Brevo como remetente (diferente do login SMTP)
const emailFrom = (process.env.EMAIL_FROM || emailUser).trim();

const transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,   // true só para 465 (SSL); 587 e 2525 usam STARTTLS
    auth: {
        user: emailUser,
        pass: emailPass
    },
    tls: { rejectUnauthorized: false }  // evita erros de certificado em dev
});

transporter.verify(function (err) {
    if (err) {
        console.error('❌ Mailer: falha na conexão SMTP —', err.message);
    } else {
        console.log(`✅ Mailer: conexão com ${emailHost}:${emailPort} pronta.`);
    }
});

async function enviarEmail({ to, subject, html }) {
    await transporter.sendMail({
        from: `"CloudMind" <${emailFrom}>`,
        to,
        subject,
        html
    });
}

module.exports = { enviarEmail };
