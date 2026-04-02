import 'dotenv/config';
import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import fs from "fs";
import { initializeApp, getApps, cert, AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin
try {
  if (getApps().length === 0) {
    // Try to get project ID from config if possible
    let projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!projectId && fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        projectId = config.projectId;
      } catch (e) {
        console.error("[ADMIN] Error reading config for project ID:", e);
      }
    }

    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const appOptions: AppOptions = {};

    if (serviceAccountPath) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), serviceAccountPath), 'utf-8'));
        appOptions.credential = cert(serviceAccount);
        console.log(`[ADMIN] Loading service account credentials from: ${serviceAccountPath}`);
      } catch (e) {
        console.warn(`[ADMIN] Failed to load service account file at ${serviceAccountPath}:`, e);
      }
    }

    if (projectId) {
      appOptions.projectId = projectId;
    }

    if (Object.keys(appOptions).length > 0) {
      initializeApp(appOptions);
      console.log(`[ADMIN] Initialized with options: ${JSON.stringify({ projectId: appOptions.projectId ? appOptions.projectId : undefined })}`);
    } else {
      console.warn("[ADMIN] No service account or project ID found in environment or config. Initializing with default credentials.");
      initializeApp();
    }
  }
} catch (e) {
  console.error("[ADMIN] Initialization error:", e);
}

// Helper to get the public app URL (prefers shared URL over dev URL)
function getPublicAppUrl(): string {
  const sharedUrl = 'https://ais-pre-iehtvdjcpij72sh4juv665-509567158991.europe-west2.run.app';
  const currentUrl = process.env.APP_URL || '';
  
  const isLocal = currentUrl.includes('localhost') || 
                  currentUrl.includes('127.0.0.1') || 
                  currentUrl.includes('192.168.') || 
                  currentUrl.includes('0.0.0.0') ||
                  currentUrl.includes('-dev-') ||
                  !currentUrl;
  
  // If we are in a dev/local environment, use the shared URL
  if (isLocal) {
    return sharedUrl;
  }
  
  // Otherwise, use the current URL
  return currentUrl || sharedUrl;
}

// Helper for sending emails
async function sendEmail(to: string | string[], subject: string, text: string, html?: string) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const from = process.env.EMAIL_FROM || user;

  if (!user || !pass) {
    console.warn("[EMAIL] Skipping email sending: EMAIL_USER or EMAIL_PASS not configured.");
    return { 
      success: false, 
      message: "لم يتم تكوين إعدادات البريد الإلكتروني على الخادم. يرجى ضبط EMAIL_USER و EMAIL_PASS في الإعدادات.",
      error: "MISSING_CONFIG" 
    };
  }

  if (!to || (Array.isArray(to) && to.length === 0) || (typeof to === 'string' && !to.trim())) {
    return { success: false, message: "لا يوجد مستلمون للبريد الإلكتروني", error: "NO_RECIPIENTS" };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `قسم الهندسة الميكانيكية <${from}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    });

    console.log(`[EMAIL] Message sent: ${info.messageId}`);
    return { success: true, message: "تم إرسال البريد الإلكتروني بنجاح", messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL] Error sending email: ${error}`);
    let errorMessage = "فشل إرسال البريد الإلكتروني.";
    if (error.code === 'EAUTH') {
      errorMessage = "خطأ في المصادقة: تأكد من صحة البريد الإلكتروني وكلمة مرور التطبيق (App Password).";
    }
    return { success: false, error: String(error), message: errorMessage };
  }
}

// Helper to get Firebase API Key from env or config file
function getFirebaseApiKey(): string {
  let apiKey = process.env.VITE_FIREBASE_API_KEY || "";
  
  // If env var is empty or a placeholder, try the config file
  if (!apiKey || apiKey.includes("YOUR_") || apiKey.length < 10) {
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.apiKey && !config.apiKey.includes("YOUR_") && config.apiKey.length > 10) {
          apiKey = config.apiKey;
        }
      }
    } catch (e) {
      console.error("[AUTH] Error reading firebase config:", e);
    }
  }
  
  if (apiKey) {
    const masked = apiKey.substring(0, 6) + "..." + apiKey.substring(apiKey.length - 4);
    console.log(`[AUTH] Using API Key: ${masked}`);
  } else {
    console.warn("[AUTH] No valid Firebase API Key found.");
  }
  
  return apiKey;
}

// Helper to create Firebase Auth user via REST API
async function createAuthUser(email: string, pass: string) {
  const apiKey = getFirebaseApiKey();
  if (!apiKey) {
    return { success: false, error: "Firebase API Key missing on server." };
  }
  return await createAuthUserWithKey(email, pass, apiKey);
}

async function createAuthUserWithKey(email: string, pass: string, apiKey: string) {
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: pass,
        returnSecureToken: false
      })
    });
    const data = await response.json();
    if (data.error) {
      let errorMsg = data.error.message;
      console.error(`[AUTH] REST API Error: ${JSON.stringify(data.error)}`);
      
      // Detect if API is disabled or permission denied
      const isApiDisabled = errorMsg.includes("identitytoolkit.googleapis.com") || 
                           data.error.status === "PERMISSION_DENIED" || 
                           (data.error.details && JSON.stringify(data.error.details).includes("SERVICE_DISABLED"));
      
      if (isApiDisabled) {
        errorMsg = "IDENTITY_TOOLKIT_DISABLED";
      }
      return { success: false, error: errorMsg };
    }
    return { success: true, uid: data.localId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  console.log('[CONFIG] Checking environment variables...');
  console.log(`[CONFIG] EMAIL_USER: ${process.env.EMAIL_USER ? 'SET' : 'NOT SET'}`);
  console.log(`[CONFIG] EMAIL_PASS: ${process.env.EMAIL_PASS ? 'SET' : 'NOT SET'}`);

  // API Routes
  app.get("/api/config/status", (req, res) => {
    res.json({
      emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
      emailUser: process.env.EMAIL_USER ? process.env.EMAIL_USER : null,
      appUrl: getPublicAppUrl()
    });
  });

  app.get("/api/auth/check-status", async (req, res) => {
    const apiKey = getFirebaseApiKey();
    if (!apiKey) {
      return res.json({ success: false, error: "Firebase API Key missing on server." });
    }

    try {
      // Try a dummy request to Identity Toolkit to check if it's enabled
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: "DUMMY_TOKEN" })
      });
      const data = await response.json();
      
      // If we get INVALID_ID_TOKEN, it means the API is enabled (it processed the request)
      // If we get PERMISSION_DENIED or SERVICE_DISABLED, it's disabled
      const isApiDisabled = data.error && (
        data.error.message?.includes("identitytoolkit.googleapis.com") || 
        data.error.status === "PERMISSION_DENIED" || 
        (data.error.details && JSON.stringify(data.error.details).includes("SERVICE_DISABLED"))
      );

      if (isApiDisabled) {
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0665993045";
        return res.json({ 
          success: false, 
          error: "IDENTITY_TOOLKIT_DISABLED",
          projectId,
          message: `Identity Toolkit API is disabled. Enable it at: https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=${projectId}`
        });
      }

      res.json({ success: true, enabled: true });
    } catch (error) {
      res.json({ success: false, error: String(error) });
    }
  });

  app.get("/api/auth/get-user-by-email", async (req, res) => {
    const { email } = req.query;
    if (!email || typeof email !== 'string') {
      return res.json({ success: false, error: "Email is required" });
    }

    try {
      const userRecord = await getAuth().getUserByEmail(email);
      res.json({ success: true, uid: userRecord.uid });
    } catch (error: any) {
      res.json({ success: false, error: error.code || error.message });
    }
  });

  app.post("/api/auth/create-user", async (req, res) => {
    const { email, password } = req.body;
    console.log(`[AUTH] Creating user: ${email}`);
    
    try {
      // Try using Admin SDK first for more control
      const userRecord = await getAuth().createUser({
        email,
        password,
      });
      return res.json({ success: true, uid: userRecord.uid });
    } catch (adminError: any) {
      console.warn(`[AUTH] Admin SDK create failed: ${adminError.message}`);
      
      // Detect if API is disabled in Admin SDK error
      const isAdminApiDisabled = adminError.message.includes("identitytoolkit.googleapis.com") || 
                                adminError.code === 'auth/insufficient-permission' ||
                                adminError.message.includes("SERVICE_DISABLED");

      // If email already exists, fetch the existing user to return their UID
      if (adminError.code === 'auth/email-already-exists') {
        try {
          const existingUser = await getAuth().getUserByEmail(email);
          console.log(`[AUTH] User ${email} already exists, returning existing UID: ${existingUser.uid}`);
          return res.json({ 
            success: true, 
            uid: existingUser.uid, 
            existed: true 
          });
        } catch (fetchError: any) {
          console.error(`[AUTH] Failed to fetch existing user: ${fetchError.message}`);
          // If we can't fetch the user but we know they exist, return EMAIL_EXISTS
          // This usually happens if the API is disabled but the Admin SDK still knows about the error code
          return res.json({ 
            success: false, 
            error: "EMAIL_EXISTS",
            message: "البريد الإلكتروني موجود مسبقاً ولكن تعذر جلب معرف المستخدم. يرجى تفعيل Identity Toolkit API."
          });
        }
      }

      // Fallback to REST API if Admin SDK fails (e.g. permission issues or API not enabled)
      const result = await createAuthUser(email, password);
      
      // If REST API says email exists, try to get the user by email again (in case Admin SDK failed for other reasons)
      if (result.error === "EMAIL_EXISTS") {
        try {
          const existingUser = await getAuth().getUserByEmail(email);
          return res.json({ success: true, uid: existingUser.uid, existed: true });
        } catch (e) {
          return res.json({ success: false, error: "EMAIL_EXISTS" });
        }
      }
      
      // If either failed due to disabled API, provide the helpful message
      if (result.error === "IDENTITY_TOOLKIT_DISABLED" || isAdminApiDisabled) {
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0665993045";
        return res.json({ 
          success: false, 
          error: "IDENTITY_TOOLKIT_DISABLED",
          message: `يجب تفعيل خدمة Authentication في لوحة تحكم Firebase. يرجى اتباع الخطوات التالية:
1. اذهب إلى: https://console.firebase.google.com/project/${projectId}/authentication
2. اضغط على زر 'Get Started' (البدء).
3. تأكد من تفعيل خيار 'Email/Password' في علامة التبويب 'Sign-in method'.
4. تفعيل Identity Toolkit API من الرابط التالي: https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=${projectId}`
        });
      }
      
      res.json(result);
    }
  });

  app.post("/api/auth/update-password", async (req, res) => {
    const { email, password, uid } = req.body;
    console.log(`[AUTH] Updating password for: ${email} (UID: ${uid})`);
    
    try {
      // If UID is a placeholder (pending_), we must create the user instead of updating
      if (uid && uid.startsWith('pending_')) {
        console.log(`[AUTH] UID is a placeholder (${uid}), redirecting to create-user logic`);
        return res.json({ 
          success: false, 
          error: "USER_NOT_FOUND", 
          shouldCreate: true,
          message: "المستخدم غير موجود في نظام المصادقة (UID مؤقت). يرجى إنشاء الحساب أولاً."
        });
      }

      // Try using Admin SDK first - this is the only reliable way for admin updates
      if (uid) {
        await getAuth().updateUser(uid, { password });
        return res.json({ success: true });
      } else if (email) {
        const userRecord = await getAuth().getUserByEmail(email);
        await getAuth().updateUser(userRecord.uid, { password });
        return res.json({ success: true, uid: userRecord.uid });
      }
      
      return res.json({ success: false, error: "Missing UID or Email" });
    } catch (adminError: any) {
      console.warn(`[AUTH] Admin SDK update failed: ${adminError.message}`);
      
      const isAdminApiDisabled = adminError.message.includes("identitytoolkit.googleapis.com") || 
                                adminError.message.includes("SERVICE_DISABLED");

      if (isAdminApiDisabled) {
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0665993045";
        return res.json({ 
          success: false, 
          error: "IDENTITY_TOOLKIT_DISABLED",
          message: `يجب تفعيل Identity Toolkit API لتحديث كلمات المرور. يرجى زيارة الرابط التالي والتأكد من الضغط على زر 'تفعيل' (Enable): https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=${projectId}`
        });
      }
      
      return res.json({ success: false, error: adminError.message || "فشل تحديث كلمة المرور عبر Admin SDK" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { email } = req.body;
    const apiKey = getFirebaseApiKey();
    if (!apiKey) {
      return res.json({ success: false, error: "Firebase API Key missing on server." });
    }

    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: "PASSWORD_RESET",
          email: email
        })
      });
      const data = await response.json();
      if (data.error) {
        let errorMsg = data.error.message;
        const isApiDisabled = errorMsg.includes("identitytoolkit.googleapis.com") || 
                             data.error.status === "PERMISSION_DENIED" || 
                             (data.error.details && JSON.stringify(data.error.details).includes("SERVICE_DISABLED"));
        
        if (isApiDisabled) {
          const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0665993045";
          return res.json({ 
            success: false, 
            error: "IDENTITY_TOOLKIT_DISABLED",
            message: `يجب تفعيل Identity Toolkit API لإرسال روابط إعادة تعيين كلمة المرور. يرجى زيارة الرابط التالي: https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=${projectId}`
          });
        }
        return res.json({ success: false, error: errorMsg });
      }
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: String(error) });
    }
  });

  app.post("/api/teachers/send-account", async (req, res) => {
    const { email, displayName, password } = req.body;
    
    console.log(`[EMAIL] Sending account details to ${displayName} (${email})`);
    
    const subject = "تفاصيل حسابك في نظام إدارة القسم - جامعة الأغواط";
    const appUrl = getPublicAppUrl();
    
    const text = `
      مرحباً ${displayName}،
      
      تم إنشاء حسابك بنجاح في نظام إدارة القسم - جامعة الأغواط.
      
      بيانات الدخول الخاصة بك:
      البريد الإلكتروني: ${email}
      كلمة المرور: ${password}
      
      يمكنك الدخول إلى النظام عبر الرابط التالي:
      ${appUrl}
      
      شكراً لك،
      قسم الهندسة الميكانيكية
    `;
    
    const html = `
      <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #18181b; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 16px; overflow: hidden;">
        <div style="background-color: #059669; padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">نظام إدارة القسم</h1>
          <p style="color: #d1fae5; margin: 8px 0 0 0;">جامعة الأغواط - كلية التكنولوجيا</p>
        </div>
        <div style="padding: 32px; line-height: 1.6;">
          <h2 style="color: #111827; margin-top: 0;">مرحباً ${displayName}،</h2>
          <p>تم إنشاء حسابك بنجاح في نظام إدارة القسم - جامعة الأغواط.</p>
          <p>يمكنك استخدام البيانات التالية لتسجيل الدخول:</p>
          
          <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #f1f5f9;">
            <p style="margin: 0 0 8px 0;"><strong>البريد الإلكتروني:</strong> ${email}</p>
            <p style="margin: 0;"><strong>كلمة المرور:</strong> ${password}</p>
          </div>

          <p>يمكنك الدخول إلى التطبيق مباشرة عبر الضغط على الزر أدناه:</p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}" style="background-color: #059669; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;">الدخول إلى النظام</a>
          </div>

          <p style="font-size: 14px; color: #71717a;">إذا لم يعمل الزر، يمكنك نسخ الرابط التالي ولصقه في متصفحك:</p>
          <p style="font-size: 14px; color: #059669; word-break: break-all;">${appUrl}</p>
          
          <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 32px 0;" />
          
          <p style="margin-bottom: 0;">شكراً لك،</p>
          <p style="margin-top: 4px; font-weight: bold; color: #059669;">قسم الهندسة الميكانيكية</p>
        </div>
        <div style="background-color: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
          &copy; ${new Date().getFullYear()} نظام إدارة القسم - جامعة الأغواط. جميع الحقوق محفوظة.
        </div>
      </div>
    `;
    
    const result = await sendEmail(email, subject, text, html);
    res.json(result);
  });

  app.post("/api/notifications/send-schedule-alert", async (req, res) => {
    const { emails, fileName } = req.body;
    console.log(`[EMAIL] Sending schedule alert to ${emails.length} teachers for file: ${fileName}`);
    
    const subject = "تحديث جديد لجدول الحصص - جامعة الأغواط";
    const appUrl = getPublicAppUrl();
    
    const text = `مرحباً،\n\nتم رفع جدول حصص جديد في النظام: ${fileName}. يرجى مراجعته في التطبيق.\n\nيمكنك الدخول هنا: ${appUrl}\n\nشكراً لك.`;
    
    const html = `
      <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #18181b; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 16px; overflow: hidden;">
        <div style="background-color: #059669; padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">نظام إدارة القسم</h1>
          <p style="color: #d1fae5; margin: 8px 0 0 0;">جامعة الأغواط - كلية التكنولوجيا</p>
        </div>
        <div style="padding: 32px; line-height: 1.6;">
          <h2 style="color: #111827; margin-top: 0;">مرحباً،</h2>
          <p>تم رفع جدول حصص جديد في النظام: <strong>${fileName}</strong>.</p>
          <p>يرجى مراجعته في التطبيق عبر الرابط أدناه:</p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}" style="background-color: #059669; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;">فتح التطبيق</a>
          </div>

          <p style="font-size: 14px; color: #71717a;">إذا لم يعمل الزر، يمكنك نسخ الرابط التالي ولصقه في متصفحك:</p>
          <p style="font-size: 14px; color: #059669; word-break: break-all;">${appUrl}</p>
          
          <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 32px 0;" />
          
          <p style="margin-bottom: 0;">شكراً لك،</p>
          <p style="margin-top: 4px; font-weight: bold; color: #059669;">قسم الهندسة الميكانيكية</p>
        </div>
        <div style="background-color: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
          &copy; ${new Date().getFullYear()} نظام إدارة القسم - جامعة الأغواط. جميع الحقوق محفوظة.
        </div>
      </div>
    `;
    const result = await sendEmail(emails, subject, text, html);
    res.json(result);
  });

  app.post("/api/projects/send-thesis", async (req, res) => {
    const { projectId, projectTitle, thesisUrl, emails } = req.body;
    console.log(`[EMAIL] Sending thesis for project "${projectTitle}" to ${emails.join(', ')}`);
    
    const subject = `مذكرة تخرج: ${projectTitle}`;
    const text = `مرحباً،\n\nتم إرسال مذكرة التخرج للمشروع "${projectTitle}" للمراجعة.\n\nيمكنك تحميلها من الرابط التالي: ${thesisUrl}\n\nشكراً لك.`;
    
    const html = `
      <div dir="rtl" style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #4f46e5;">مرحباً،</h2>
        <p>تم إرسال مذكرة التخرج للمشروع <strong>"${projectTitle}"</strong> للمراجعة.</p>
        <p>يمكنك تحميل المذكرة مباشرة عبر الرابط أدناه:</p>
        <a href="${thesisUrl}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">تحميل المذكرة</a>
        <p style="margin-top: 20px; font-size: 0.8em; color: #999;">رابط التحميل المباشر:</p>
        <p style="font-size: 0.8em; color: #10b981; word-break: break-all;">${thesisUrl}</p>
        <p style="margin-top: 20px; font-size: 0.9em; color: #666;">شكراً لك.</p>
      </div>
    `;
    
    const result = await sendEmail(emails, subject, text, html);
    res.json(result);
  });

  app.post("/api/notifications/send-field-visit-confirmation", async (req, res) => {
    const { email, teacherName, companyName } = req.body;
    console.log(`[EMAIL] Sending field visit confirmation to ${teacherName} (${email}) for visit to: ${companyName}`);
    
    const subject = "تأكيد زيارة ميدانية";
    const text = `مرحباً ${teacherName}،\n\nتم تأكيد طلب الزيارة الميدانية إلى: ${companyName}.\n\nشكراً لك.`;
    
    const result = await sendEmail(email, subject, text);
    res.json(result);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Explicitly serve index.html for all non-API routes in dev to prevent white page on refresh/direct link
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      // Skip API routes
      if (url.startsWith('/api/')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Final error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[ERROR] ${err.stack || err}`);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  });

  // Export the app for Vercel serverless environment
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`----------------------------------------------------`);
      console.log(`[SERVER] Running at http://localhost:${PORT}`);
      console.log(`----------------------------------------------------`);
    });
  }
  
  return app;
}

// Global variable to store the app instance
let appInstance: any = null;

// Initialize the app
const appPromise = startServer().then(instance => {
  appInstance = instance;
  return instance;
});

// Default export for Vercel
export default async (req: any, res: any) => {
  if (!appInstance) {
    await appPromise;
  }
  return appInstance(req, res);
};
