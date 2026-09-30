const nodemailer = require('nodemailer');

const emailUser = (process.env.EMAIL_USER || '').trim();
const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '').trim();
const emailHost = (process.env.EMAIL_HOST || 'smtp-relay.brevo.com').trim();
const emailPort = parseInt(process.env.EMAIL_PORT || '587', 10);
const emailFrom = (process.env.EMAIL_FROM || emailUser).trim();

const transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    auth: {
        user: emailUser,
        pass: emailPass
    },
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
});

transporter.verify(function (err) {
    if (err) {
        console.error('❌ Mailer: falha na conexão SMTP —', err.message);
    } else {
        console.log(`✅ Mailer: conexão com ${emailHost}:${emailPort} pronta.`);
    }
});

function escaparHtml(valor) {
    return String(valor == null ? '' : valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function enviarEmail({ to, subject, html }) {
    await transporter.sendMail({
        from: `"CloudMind" <${emailFrom}>`,
        to,
        subject,
        html
    });
}

module.exports = { enviarEmail, escaparHtml };
