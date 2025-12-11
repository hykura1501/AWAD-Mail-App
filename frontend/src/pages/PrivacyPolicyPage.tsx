import React from "react";

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-md rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: December 11, 2025
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            1. Introduction
          </h2>
          <p className="text-gray-700 mb-4">
            Welcome to AWAD Mail App. We respect your privacy and are committed
            to protecting your personal data. This privacy policy explains how
            we collect, use, and safeguard your information when you use our
            email application.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            2. Information We Collect
          </h2>
          <p className="text-gray-700 mb-4">
            We collect the following types of information:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>
              <strong>Email Account Information:</strong> Email address, name,
              and authentication credentials
            </li>
            <li>
              <strong>Email Data:</strong> Email content, attachments, and
              metadata (sender, recipient, timestamps)
            </li>
            <li>
              <strong>Usage Data:</strong> How you interact with our
              application, features used, and preferences
            </li>
            <li>
              <strong>Device Information:</strong> Browser type, IP address, and
              device identifiers
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            3. How We Use Your Information
          </h2>
          <p className="text-gray-700 mb-4">We use your information to:</p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>Provide and maintain our email services</li>
            <li>Display and organize your emails</li>
            <li>Enable email sending and receiving functionality</li>
            <li>Improve and optimize our application</li>
            <li>Provide customer support</li>
            <li>Ensure security and prevent fraud</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            4. Data Storage and Security
          </h2>
          <p className="text-gray-700 mb-4">
            We implement industry-standard security measures to protect your
            data:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>Encryption of data in transit using SSL/TLS</li>
            <li>Secure storage of credentials using encryption</li>
            <li>Regular security audits and updates</li>
            <li>
              Limited access to personal data by authorized personnel only
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            5. Third-Party Services
          </h2>
          <p className="text-gray-700 mb-4">
            Our application integrates with third-party services:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>
              <strong>Google OAuth:</strong> For authentication with Gmail
              accounts
            </li>
            <li>
              <strong>IMAP/SMTP Providers:</strong> To access and send emails
            </li>
            <li>
              <strong>Google Gemini AI:</strong> For email content analysis and
              suggestions (optional feature)
            </li>
          </ul>
          <p className="text-gray-700 mt-4">
            These services have their own privacy policies, and we encourage you
            to review them.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            6. Data Sharing
          </h2>
          <p className="text-gray-700 mb-4">
            We do not sell, trade, or rent your personal information to third
            parties. We may share your data only in the following circumstances:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>With your explicit consent</li>
            <li>To comply with legal obligations</li>
            <li>To protect our rights and prevent fraud</li>
            <li>
              With service providers who assist in operating our application
              (under strict confidentiality agreements)
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            7. Your Rights
          </h2>
          <p className="text-gray-700 mb-4">You have the right to:</p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Revoke access permissions at any time</li>
            <li>Export your data</li>
            <li>Object to data processing</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            8. Cookies and Tracking
          </h2>
          <p className="text-gray-700 mb-4">
            We use cookies and similar technologies to enhance user experience,
            maintain sessions, and analyze usage patterns. You can control
            cookie settings through your browser preferences.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            9. Data Retention
          </h2>
          <p className="text-gray-700 mb-4">
            We retain your data only as long as necessary to provide our
            services and comply with legal obligations. You can request deletion
            of your account and associated data at any time.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            10. Children's Privacy
          </h2>
          <p className="text-gray-700 mb-4">
            Our service is not intended for users under the age of 13. We do not
            knowingly collect personal information from children.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            11. Changes to This Policy
          </h2>
          <p className="text-gray-700 mb-4">
            We may update this privacy policy from time to time. We will notify
            you of any significant changes by posting the new policy on this
            page and updating the "Last Updated" date.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            12. Contact Us
          </h2>
          <p className="text-gray-700 mb-4">
            If you have any questions about this Privacy Policy, please contact
            us at:
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
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            13. Google API Services User Data Policy
          </h2>
          <p className="text-gray-700 mb-4">
            AWAD Mail App's use and transfer to any other app of information
            received from Google APIs will adhere to
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {" "}
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
