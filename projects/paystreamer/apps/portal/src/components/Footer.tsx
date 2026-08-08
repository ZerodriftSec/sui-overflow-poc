import { Github, Twitter, MessageCircle, Globe } from 'lucide-react';

export default function Footer() {
  const links = {
    Product: ['Features', 'How It Works', 'Pricing', 'Security', 'Roadmap'],
    Developers: ['Documentation', 'API Reference', 'SDKs', 'GitHub', 'Status'],
    Company: ['About', 'Blog', 'Careers', 'Press', 'Contact'],
    Resources: ['Help Center', 'Community', 'Forum', 'Security Audit', 'Bug Bounty']
  };

  const socials = [
    { icon: <Twitter size={20} />, label: 'Twitter', href: '#' },
    { icon: <MessageCircle size={20} />, label: 'Discord', href: '#' },
    { icon: <Github size={20} />, label: 'GitHub', href: '#' },
    { icon: <Globe size={20} />, label: 'Website', href: '#' }
  ];

  return (
    <footer className="relative py-16 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Logo & Description */}
        <div className="flex flex-col md:flex-row gap-8 mb-12">
          <div className="max-w-sm">
            <a href="#" className="flex items-center gap-3 mb-4">
              <img src="/logo.png" alt="PayStreamer Logo" className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(108,99,255,0.5)]" />
              <span className="text-xl font-bold text-white">PayStreamer</span>
            </a>
            <p className="text-sm text-[#94a3b8]">
              Empowering users with full control over their subscription payments on the Sui blockchain.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-8 flex-1 justify-end">
            {Object.entries(links).map(([category, items]) => (
              <div key={category}>
                <h4 className="text-white font-medium mb-4">{category}</h4>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item}>
                      <a href="#" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10 gap-4">
          <div className="text-sm text-[#94a3b8]">
            © 2024 PayStreamer. Built on Sui Network.
          </div>

          <div className="flex items-center gap-4">
            {socials.map((social, i) => (
              <a
                key={i}
                href={social.href}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-[#94a3b8] hover:text-white"
                aria-label={social.label}
              >
                {social.icon}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a href="#" className="text-[#94a3b8] hover:text-white transition-colors">Privacy</a>
            <a href="#" className="text-[#94a3b8] hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}