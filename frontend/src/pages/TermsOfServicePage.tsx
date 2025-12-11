import React from "react";

const TermsOfServicePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-md rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: December 11, 2025
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            1. Acceptance of Terms
          </h2>
          <p className="text-gray-700 mb-4">
            By accessing and using AWAD Mail App ("the Service"), you agree to
            be bound by these Terms of Service ("Terms"). If you do not agree to
            these Terms, please do not use the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            2. Description of Service
          </h2>
          <p className="text-gray-700 mb-4">
            AWAD Mail App is an email management application that allows users
            to:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>Connect and manage multiple email accounts</li>
            <li>Read, compose, send, and organize emails</li>
            <li>Use AI-powered features for email management</li>
            <li>Organize emails using Kanban boards</li>
            <li>Access emails through IMAP/OAuth protocols</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            3. User Accounts
          </h2>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            3.1 Account Creation
          </h3>
          <p className="text-gray-700 mb-4">
            To use the Service, you must create an account by providing accurate
            and complete information. You are responsible for maintaining the
            confidentiality of your account credentials.
          </p>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            3.2 Account Responsibility
          </h3>
          <p className="text-gray-700 mb-4">
            You are responsible for all activities that occur under your
            account. You must notify us immediately of any unauthorized use of
            your account.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            4. Acceptable Use
          </h2>
          <p className="text-gray-700 mb-4">
            You agree NOT to use the Service to:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>Send spam, unsolicited emails, or phishing attempts</li>
            <li>Transmit viruses, malware, or harmful code</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe on intellectual property rights</li>
            <li>Harass, abuse, or harm others</li>
            <li>Impersonate any person or entity</li>
            <li>Interfere with or disrupt the Service</li>
            <li>Attempt to gain unauthorized access to our systems</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            5. Email Account Connections
          </h2>
          <p className="text-gray-700 mb-4">
            When you connect your email accounts (Gmail, Outlook, etc.) to our
            Service:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>
              You grant us permission to access your email data as necessary to
              provide the Service
            </li>
            <li>
              We will only access data required for the functionality you use
            </li>
            <li>
              You can revoke access at any time through your email provider's
              settings
            </li>
            <li>
              You are responsible for the security of your email account
              credentials
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            6. Privacy and Data Protection
          </h2>
          <p className="text-gray-700 mb-4">
            Your privacy is important to us. Our collection and use of your
            personal information is governed by our
            <a href="/privacy-policy" className="text-blue-600 hover:underline">
              {" "}
              Privacy Policy
            </a>
            , which is incorporated into these Terms by reference.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            7. AI Features
          </h2>
          <p className="text-gray-700 mb-4">
            Our Service includes AI-powered features (powered by Google Gemini)
            that may analyze email content to provide:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>Email summaries and suggestions</li>
            <li>Smart categorization and organization</li>
            <li>Automated responses and composition assistance</li>
          </ul>
          <p className="text-gray-700 mt-4">
            By using these features, you acknowledge that email content may be
            processed by AI systems. You can opt out of AI features at any time.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            8. Intellectual Property
          </h2>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            8.1 Our Rights
          </h3>
          <p className="text-gray-700 mb-4">
            All content, features, and functionality of the Service, including
            but not limited to text, graphics, logos, and software, are owned by
            AWAD Mail App and protected by copyright, trademark, and other
            intellectual property laws.
          </p>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            8.2 Your Content
          </h3>
          <p className="text-gray-700 mb-4">
            You retain all rights to your email content. By using the Service,
            you grant us a limited license to access, store, and process your
            content solely to provide the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            9. Service Availability
          </h2>
          <p className="text-gray-700 mb-4">
            We strive to provide reliable service, but we do not guarantee:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>Uninterrupted or error-free operation</li>
            <li>That defects will be corrected immediately</li>
            <li>That the Service is free from viruses or harmful components</li>
          </ul>
          <p className="text-gray-700 mt-4">
            We reserve the right to modify, suspend, or discontinue the Service
            at any time with or without notice.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            10. Fees and Payment
          </h2>
          <p className="text-gray-700 mb-4">
            AWAD Mail App is currently provided free of charge. We reserve the
            right to introduce paid features or subscription plans in the
            future, with advance notice to users.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            11. Disclaimer of Warranties
          </h2>
          <p className="text-gray-700 mb-4">
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
            WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT
            LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            12. Limitation of Liability
          </h2>
          <p className="text-gray-700 mb-4">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, AWAD MAIL APP SHALL NOT BE
            LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
            PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER
            INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL,
            OR OTHER INTANGIBLE LOSSES.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            13. Indemnification
          </h2>
          <p className="text-gray-700 mb-4">
            You agree to indemnify and hold harmless AWAD Mail App from any
            claims, damages, losses, liabilities, and expenses arising from your
            use of the Service or violation of these Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            14. Termination
          </h2>
          <p className="text-gray-700 mb-4">
            We reserve the right to suspend or terminate your account and access
            to the Service:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>For violation of these Terms</li>
            <li>For suspicious or fraudulent activity</li>
            <li>At our sole discretion, with or without cause</li>
          </ul>
          <p className="text-gray-700 mt-4">
            You may terminate your account at any time by contacting us or
            through the account settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            15. Changes to Terms
          </h2>
          <p className="text-gray-700 mb-4">
            We may modify these Terms at any time. We will notify you of
            material changes by posting the updated Terms on this page and
            updating the "Last Updated" date. Your continued use of the Service
            after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            16. Governing Law
          </h2>
          <p className="text-gray-700 mb-4">
            These Terms shall be governed by and construed in accordance with
            the laws of Vietnam, without regard to conflict of law principles.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            17. Dispute Resolution
          </h2>
          <p className="text-gray-700 mb-4">
            Any disputes arising from these Terms or the Service shall be
            resolved through good faith negotiations. If negotiations fail,
            disputes shall be submitted to the competent courts of Ho Chi Minh
            City, Vietnam.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            18. Severability
          </h2>
          <p className="text-gray-700 mb-4">
            If any provision of these Terms is found to be invalid or
            unenforceable, the remaining provisions shall continue in full force
            and effect.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            19. Contact Information
          </h2>
          <p className="text-gray-700 mb-4">
            If you have any questions about these Terms of Service, please
            contact us at:
          </p>
          <ul className="list-none text-gray-700 space-y-2 ml-4">
            <li>
              <strong>Email:</strong> phanhongphuc26094@gmail.com
            </li>
            <li>
              <strong>Address:</strong> HCMC, Vietnam
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <p className="text-gray-700 font-semibold">
            By using AWAD Mail App, you acknowledge that you have read,
            understood, and agree to be bound by these Terms of Service.
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsOfServicePage;
