// The theme chosen in the theme menu (a cookie), on <html> before the page paints
document.documentElement.className = /(?:^|; )theme=(light|dark)/.exec(document.cookie)?.[1] ?? 'system'
