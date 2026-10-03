/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
	],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // 花体手写字体，供 wordmark 的「by」等小装饰文字使用，由 app/layout.tsx 注入 CSS 变量
        script: ["var(--font-dancing-script)", "cursive"],
      },
      colors: {
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "hsl(var(--border-subtle))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: {
          DEFAULT: "hsl(var(--foreground))",
          subtle: "hsl(var(--subtle-foreground))",
        },
        surface: {
          subtle: "hsl(var(--surface-subtle))",
          strong: "hsl(var(--surface-strong))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          strong: "hsl(var(--brand-strong))",
          logo: "hsl(var(--brand-logo))",
          foreground: "hsl(var(--brand-foreground))",
          from: "hsl(var(--brand-from))",
          to: "hsl(var(--brand-to))",
        },
        wordmark: {
          from: "hsl(var(--wordmark-from))",
          to: "hsl(var(--wordmark-to))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: "hsl(var(--warning))",
        // get_bg() 的四档等级渐变（bg-clip-text 数字色），浅/深两套由 CSS 变量决定
        grade: {
          none: {
            from: "hsl(var(--grade-none-from))",
            to: "hsl(var(--grade-none-to))",
          },
          low: {
            from: "hsl(var(--grade-low-from))",
            to: "hsl(var(--grade-low-to))",
          },
          mid: {
            from: "hsl(var(--grade-mid-from))",
            to: "hsl(var(--grade-mid-to))",
          },
          high: {
            from: "hsl(var(--grade-high-from))",
            to: "hsl(var(--grade-high-to))",
          },
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          strong: "hsl(var(--destructive-strong))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}