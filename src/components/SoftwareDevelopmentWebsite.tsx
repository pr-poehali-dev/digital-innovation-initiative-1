import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { ArrowRight, ChevronRight, Menu, X, Map, Target, TrendingUp, CheckCircle, Sparkles, Users, Plus } from "lucide-react"
import { motion, type Variants } from "framer-motion"
import { cn } from "@/lib/utils"
import { Link } from "react-router-dom"
import { useAuth } from "@/lib/auth-context"
import { analytics } from "@/lib/analytics"
import SeoMeta from "@/components/SeoMeta"
import Icon from "@/components/ui/icon"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = "Button"



const defaultContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const defaultItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

function AnimatedGroup({
  children,
  className,
  variants,
}: {
  children: React.ReactNode
  className?: string
  variants?: {
    container?: Variants
    item?: Variants
  }
}) {
  const containerVariants = variants?.container || defaultContainerVariants
  const itemVariants = variants?.item || defaultItemVariants

  return (
    <motion.div initial="hidden" animate="visible" variants={containerVariants} className={cn(className)}>
      {React.Children.map(children, (child, index) => (
        <motion.div key={index} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

const transitionVariants = {
  item: {
    hidden: {
      opacity: 0,
      filter: "blur(12px)",
      y: 12,
    },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: {
        type: "spring",
        bounce: 0.3,
        duration: 1.5,
      },
    },
  },
}

const menuItems = [
  { name: "Как это работает", href: "#how-it-works" },
  { name: "Для кого", href: "#about" },
  { name: "FAQ", href: "#faq" },
  { name: "Инструкция", href: "/guide" },
  { name: "Контакты", href: "#contact" },
]

// ── Контент лендинга ──────────────────────────────────────────────────

const HOW_IT_WORKS_STEPS = [
  {
    num: "01",
    icon: "Target",
    accent: "bg-emerald-50 border-emerald-200",
    numColor: "text-emerald-600",
    iconColor: "text-emerald-500",
    title: "Выберите цель",
    desc: "Укажите роль, к которой хотите двигаться.",
  },
  {
    num: "02",
    icon: "ClipboardList",
    accent: "bg-violet-50 border-violet-200",
    numColor: "text-violet-600",
    iconColor: "text-violet-500",
    title: "Оцените текущий уровень",
    desc: "Заполните профиль и пройдите самооценку.",
  },
  {
    num: "03",
    icon: "Map",
    accent: "bg-blue-50 border-blue-200",
    numColor: "text-blue-600",
    iconColor: "text-blue-500",
    title: "Получите план развития",
    desc: "Система покажет приоритеты и следующий шаг.",
  },
  {
    num: "04",
    icon: "BadgeCheck",
    accent: "bg-indigo-50 border-indigo-200",
    numColor: "text-indigo-600",
    iconColor: "text-indigo-500",
    title: "Подтверждайте прогресс",
    desc: "Фиксируйте практику, результаты и примеры опыта.",
  },
]

const FOR_WHOM = [
  {
    label: "Индивидуально",
    icon: <TrendingUp className="h-5 w-5 text-emerald-600" />,
    bg: "bg-emerald-50",
    title: "Специалистам",
    desc: "Поймёте, какие навыки развивать дальше. Получите план, а не просто список советов.",
  },
  {
    label: "Для команды",
    icon: <Users className="h-5 w-5 text-blue-600" />,
    bg: "bg-blue-50",
    title: "Руководителям",
    desc: "Видите сильные стороны и точки роста — свои и команды. Развитие становится управляемым.",
  },
  {
    label: "Карьерный переход",
    icon: <Target className="h-5 w-5 text-violet-600" />,
    bg: "bg-violet-50",
    title: "Тем, кто готовится к новой роли",
    desc: "Двигаетесь не вслепую — знаете, что нужно подтянуть, и видите, насколько вы уже близко.",
  },
]

const FAQ_ITEMS = [
  {
    id: "faq-start",
    q: "Что нужно, чтобы начать?",
    a: "Достаточно заполнить профиль и пройти самооценку. После этого платформа сможет показать сильные стороны, зоны роста и следующий шаг.",
  },
  {
    id: "faq-time",
    q: "Сколько времени занимает самооценка?",
    a: "Зависит от количества компетенций, но в большинстве случаев это короткий стартовый этап — после которого уже можно увидеть первые рекомендации.",
  },
  {
    id: "faq-diff",
    q: "Чем это отличается от обычного каталога курсов?",
    a: "Платформа не просто предлагает материалы. Она помогает понять, к какой роли вы идёте, чего пока не хватает, что делать в первую очередь — и как подтверждать прогресс.",
  },
  {
    id: "faq-update",
    q: "Можно ли обновлять план развития?",
    a: "Да. Если профиль, оценки или цель изменились — план можно пересобрать и получить обновлённые приоритеты.",
  },
  {
    id: "faq-proof",
    q: "Как подтверждается прогресс?",
    a: "Через выполненные шаги, практику, результаты задач и другие подтверждения опыта — которые показывают, что развитие происходит не только на словах.",
  },
]

const HeroHeader = () => {
  const [menuState, setMenuState] = React.useState(false)
  const [isScrolled, setIsScrolled] = React.useState(false)
  const { user } = useAuth()

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header>
      <nav data-state={menuState && "active"} className="fixed z-20 w-full px-2 group">
        <div
          className={cn(
            "mx-auto mt-1 max-w-5xl px-4 transition-all duration-300 lg:px-8",
            isScrolled && "bg-background/50 max-w-4xl rounded-2xl border backdrop-blur-lg lg:px-4",
          )}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-4 py-3 lg:gap-6 lg:py-0">
            <div className="flex w-full justify-between lg:w-auto lg:flex-shrink-0">
              <a href="/" aria-label="home" className="flex items-center space-x-2">
                <Logo />
              </a>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState == true ? "Закрыть меню" : "Открыть меню"}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
              >
                <Menu className="in-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
              </button>
            </div>

            <div className="hidden lg:flex lg:flex-1 lg:justify-center">
              <ul className="flex gap-6 text-sm">
                {menuItems.map((item, index) => (
                  <li key={index}>
                    <a
                      href={item.href}
                      className="text-muted-foreground hover:text-accent-foreground block duration-150 whitespace-nowrap"
                    >
                      <span>{item.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-background group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent dark:shadow-none dark:lg:bg-transparent">
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <a
                        href={item.href}
                        className="text-muted-foreground hover:text-accent-foreground block duration-150"
                      >
                        <span>{item.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                {user ? (
                  <Link to="/cabinet">
                    <Button size="sm" className="bg-slate-800 hover:bg-slate-700">
                      <span>Мой кабинет</span>
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link to="/login">
                      <Button variant="outline" size="sm" className={cn(isScrolled && "lg:hidden")}>
                        <span>Войти</span>
                      </Button>
                    </Link>
                    <Link to="/login">
                      <Button
                        size="sm"
                        className={cn(
                          isScrolled
                            ? "lg:inline-flex bg-slate-800 hover:bg-slate-700"
                            : "hidden bg-slate-800 hover:bg-slate-700",
                        )}
                      >
                        <span>Войти в кабинет</span>
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}

const Logo = ({ className }: { className?: string }) => {
  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg p-2">
        <span className="text-white font-bold text-base leading-none">Т</span>
      </div>
      <span className="text-xl font-bold">Траектория</span>
    </div>
  )
}


function FaqList() {
  const [open, setOpen] = React.useState<string | null>(null)
  const { user } = useAuth()
  return (
    <div className="space-y-3">
      {FAQ_ITEMS.map(item => (
        <div key={item.id} className="bg-background border border-slate-200 rounded-2xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
            onClick={() => {
              const next = open === item.id ? null : item.id
              setOpen(next)
              analytics.faqToggled(item.id, next ? "open" : "close")
            }}
          >
            <span className="text-sm font-semibold text-slate-800">{item.q}</span>
            <span className={`flex-shrink-0 w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center transition-transform ${open === item.id ? "rotate-45" : ""}`}>
              <Plus className="w-3 h-3 text-slate-500" />
            </span>
          </button>
          {open === item.id && (
            <div className="px-5 pb-4">
              <p className="text-sm text-slate-600 leading-relaxed">{item.a}</p>
            </div>
          )}
        </div>
      ))}
      <div className="text-center pt-4">
        <Link to={user ? "/cabinet/competency-map" : "/login"}
          onClick={() => {
            analytics.landingPrimaryCtaClicked("Начать самооценку", "hero", !!user)
            analytics.landingCtaClicked("faq_start_self_assessment", user ? "/cabinet/competency-map" : "/login")
          }}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors">
          Начать самооценку
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

export default function SoftwareDevelopmentWebsite() {
  const { user } = useAuth()
  const viewFired = React.useRef(false)

  React.useEffect(() => {
    if (!viewFired.current) {
      viewFired.current = true
      analytics.landingView(!!user)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])



  return (
    <>
      <SeoMeta
        title="Персональный план развития компетенций под целевую роль — Траектория"
        description="Оцените свои навыки, увидьте сильные стороны и зоны роста, получите персональный план развития с обучением, практикой и подтверждением прогресса."
        canonical="https://raven.moscow/"
      />
      <HeroHeader />
      <main className="overflow-hidden">
        <div
          aria-hidden
          className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block"
        >
          <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(220,13%,18%,.08)_0,hsla(220,13%,18%,.02)_50%,hsla(220,13%,18%,0)_80%)]" />
          <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(220,13%,18%,.06)_0,hsla(220,13%,18%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
        </div>

        {/* ── Hero — 2 колонки ── */}
        <section>
          <div className="relative pt-20 md:pt-32 pb-8 md:pb-0">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]"
            />
            <div className="mx-auto max-w-7xl px-6">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

                {/* Левая колонка — текст + CTA */}
                <AnimatedGroup variants={transitionVariants}>
                  <div>
                    {/* Eyebrow */}
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-5">
                      Платформа развития компетенций
                    </p>

                    <h1 className="text-4xl md:text-5xl lg:text-[52px] font-bold text-slate-900 leading-tight text-balance max-w-xl">
                      Поймите, какие навыки развивать дальше — и получите план под целевую роль
                    </h1>

                    <p className="mt-5 text-base md:text-lg text-slate-500 leading-relaxed max-w-lg">
                      Оцените текущий уровень, увидьте сильные стороны и зоны роста, а затем соберите понятный путь развития с обучением, практикой и подтверждением прогресса.
                    </p>

                    {/* CTAs */}
                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                      <Link to={user ? "/cabinet/competency-map" : "/login"}
                        onClick={() => {
                          analytics.landingPrimaryCtaClicked("Начать самооценку", "hero", !!user);
                          analytics.landingCtaClicked("hero_start_self_assessment", user ? "/cabinet/competency-map" : "/login");
                        }}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors">
                        <Map className="h-4 w-4 flex-shrink-0" />
                        Начать самооценку
                      </Link>
                      <a href="#how-it-works"
                        onClick={() => {
                          analytics.landingSecondaryCtaClicked("Как это работает", "hero");
                          analytics.landingCtaClicked("hero_learn_more", "#how-it-works");
                        }}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium rounded-xl border border-slate-200 transition-colors">
                        Как это работает
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </a>
                    </div>

                    {/* Mobile compact product card — только до lg */}
                    <div className="mt-6 lg:hidden bg-white border border-slate-200 rounded-2xl shadow-md shadow-slate-100/60 overflow-hidden">
                      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                        <div>
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Целевая роль</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">Product Manager</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Готовность</p>
                          <p className="text-xl font-bold text-emerald-600 leading-none mt-0.5">72%</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100">
                        <div className="h-1.5 bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: "72%" }} />
                      </div>
                      <div className="px-4 py-3 flex items-center gap-3 bg-gradient-to-r from-violet-50 to-indigo-50">
                        <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold text-violet-700 uppercase tracking-wider">Следующий шаг</p>
                          <p className="text-xs font-semibold text-slate-800 leading-snug truncate">Подтвердить опыт приоритизации</p>
                        </div>
                        <span className="ml-auto text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-semibold flex-shrink-0">Практика</span>
                      </div>
                    </div>

                    {/* Value strip */}
                    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
                      {["Сильные стороны", "Зоны роста", "Персональный план"].map((v, i) => (
                        <React.Fragment key={v}>
                          {i > 0 && <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0 hidden sm:block" />}
                          <span className="flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            {v}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </AnimatedGroup>

                {/* Правая колонка — product UI visual */}
                <AnimatedGroup variants={{
                  container: { visible: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } } },
                  ...transitionVariants,
                }}>
                  <div className="relative hidden lg:block select-none">

                    {/* Main product card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">

                      {/* Card top bar */}
                      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Целевая роль</p>
                            <p className="text-sm font-bold text-slate-900 mt-0.5">Product Manager</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Готовность</p>
                            <p className="text-2xl font-bold text-emerald-600 leading-none mt-0.5">72%</p>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-2 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full" style={{ width: "72%" }} />
                        </div>
                      </div>

                      {/* Следующий шаг */}
                      <div className="px-5 py-4 bg-gradient-to-r from-violet-50 to-indigo-50 border-b border-violet-100/60">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-5 h-5 rounded-md bg-violet-600 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-3 h-3 text-white" />
                          </div>
                          <p className="text-[11px] font-bold text-violet-800 uppercase tracking-wider">Следующий шаг</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Подтвердить опыт приоритизации</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-semibold">Практика</span>
                          <span className="text-[10px] text-slate-400">30–45 мин</span>
                        </div>
                      </div>

                      {/* Strengths + Gaps */}
                      <div className="px-5 py-4 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Сильные стороны</p>
                          {["Стратегия", "Коммуникация", "Анализ данных"].map(s => (
                            <div key={s} className="flex items-center gap-1.5 mb-1.5">
                              <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              <span className="text-[11px] text-slate-600">{s}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Зоны роста</p>
                          {["Технический бэкграунд", "Финансы"].map(g => (
                            <div key={g} className="flex items-center gap-1.5 mb-1.5">
                              <div className="w-3 h-3 rounded-full bg-amber-100 border border-amber-300 flex-shrink-0" />
                              <span className="text-[11px] text-slate-600">{g}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Floating readiness badge */}
                    <div className="absolute -bottom-3 -right-3 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 shadow-lg shadow-slate-200/60 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-800">+8% за месяц</p>
                        <p className="text-[9px] text-slate-400">Прогресс растёт</p>
                      </div>
                    </div>

                  </div>
                </AnimatedGroup>

              </div>
            </div>
          </div>
        </section>

        {/* Секция: как это работает */}
        <section id="how-it-works" className="py-16 md:py-24 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-12">
              <span className="inline-block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Как это работает</span>
              <h2 className="text-balance text-3xl md:text-4xl font-bold text-slate-900">
                Четыре шага — <span className="text-slate-500">от оценки до подтверждённого прогресса</span>
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <div key={i} className={`relative rounded-2xl border p-5 flex flex-col ${step.accent}`}>
                  {i < HOW_IT_WORKS_STEPS.length - 1 && (
                    <div className="hidden lg:block absolute top-[22px] -right-2.5 z-10">
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-2xl font-black leading-none ${step.numColor}`}>{step.num}</span>
                    <Icon name={step.icon} size={16} className={step.iconColor} fallback="Circle" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1.5 text-sm">{step.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed flex-1">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        {/* ── Что вы получите ── */}
        <section className="py-16 md:py-24 bg-white">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-12">
              <span className="inline-block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-3">Что вы получите</span>
              <h2 className="text-balance text-3xl md:text-4xl font-bold text-slate-900">
                Не просто оценка — <span className="text-slate-600">понятный следующий шаг</span>
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: "Star",       color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100", title: "Сильные стороны",         desc: "Поймёте, на что уже можно опираться при движении к роли." },
                { icon: "TrendingUp", color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-100",   title: "Зоны роста",              desc: "Увидите, что мешает двигаться к цели и что закрыть первым." },
                { icon: "Sparkles",   color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-100",  title: "Следующие шаги",          desc: "Конкретные рекомендации — обучение, практика, применение." },
                { icon: "BadgeCheck", color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-100",    title: "Подтверждения прогресса", desc: "Фиксируйте рост не только обучением, но и реальным опытом." },
              ].map(item => (
                <div key={item.title} className={`bg-white rounded-2xl border ${item.border} p-5 flex flex-col gap-3 shadow-sm`}>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.bg}`}>
                    <Icon name={item.icon} size={20} className={item.color} />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm">{item.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Блок «Для кого» ── */}
        <section id="about" className="py-16 md:py-24 bg-slate-50">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-12">
              <span className="inline-block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-3">Для кого</span>
              <h2 className="text-balance text-3xl md:text-4xl font-bold text-slate-900">
                Для тех, кто управляет <span className="text-slate-600">своим развитием</span>
              </h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-5">
              {FOR_WHOM.map((item) => (
                <div key={item.title} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.bg}`}>
                      {item.icon}
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.label}</span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-base mt-1">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed flex-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Роадмап: доступно сейчас / в разработке ── */}


        {/* ── FAQ ── */}
        <section id="faq" className="py-16 md:py-24 bg-slate-50">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-12">
              <h2 className="text-balance text-3xl md:text-4xl font-bold">Частые вопросы</h2>
            </div>
            <FaqList />
          </div>
        </section>

        {/* ── Финальный CTA ── */}
        <section className="py-16 md:py-24 bg-slate-900">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="text-balance text-3xl md:text-4xl font-bold text-white mb-4">
              Начните с оценки текущего уровня — и получите первый план развития
            </h2>
            <p className="text-slate-400 mb-8 text-base leading-relaxed">
              Это займёт немного времени, но сразу покажет сильные стороны, зоны роста и следующий шаг.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to={user ? "/cabinet/competency-map" : "/login"}
                onClick={() => {
                  analytics.landingPrimaryCtaClicked("Начать самооценку", "final_cta", !!user);
                  analytics.landingCtaClicked("final_start_self_assessment", user ? "/cabinet/competency-map" : "/login");
                }}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-white hover:bg-slate-50 text-slate-900 text-sm font-semibold rounded-xl transition-colors">
                <Map className="h-4 w-4 flex-shrink-0" />
                Начать самооценку
              </Link>
              <Link to="/guide"
                onClick={() => {
                  analytics.landingSecondaryCtaClicked("Открыть инструкцию", "final_cta");
                  analytics.landingCtaClicked("final_open_guide", "/guide");
                }}
                className="inline-flex items-center gap-1.5 px-6 py-3.5 text-slate-400 hover:text-white text-sm font-medium rounded-xl transition-colors">
                Открыть инструкцию
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

      </main>

      <footer id="contact" className="bg-background border-t border-slate-200">
        <div className="mx-auto max-w-7xl py-16 px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">

            {/* Company Info */}
            <div className="space-y-4 sm:col-span-2 lg:col-span-1">
              <Logo />
              <p className="text-sm text-muted-foreground max-w-xs">
                Траектория — платформа для осознанного профессионального развития. Карта компетенций, growth-план, обучение и проекты — в одном кабинете.
              </p>
            </div>

            {/* Навигация */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Навигация</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#how-it-works" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Как это работает
                  </a>
                </li>
                <li>
                  <a href="#about" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Для кого
                  </a>
                </li>
                <li>
                  <a href="#faq" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    FAQ
                  </a>
                </li>
                <li>
                  <Link to="/login" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Войти в кабинет
                  </Link>
                </li>
              </ul>
            </div>

            {/* Юридическая информация */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Юридическая информация</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/legal/privacy" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Политика конфиденциальности
                  </Link>
                </li>
                <li>
                  <Link to="/legal/terms" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Пользовательское соглашение
                  </Link>
                </li>
                <li>
                  <Link to="/legal/offer" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Оферта
                  </Link>
                </li>
                <li>
                  <Link to="/legal/refund" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Возврат средств
                  </Link>
                </li>
                <li>
                  <Link to="/legal/consent" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Согласие на обработку ПДн
                  </Link>
                </li>
              </ul>
              <div className="pt-2 text-xs text-muted-foreground space-y-0.5 border-t border-slate-100">
                <p>ИП Кузьменко А.В.</p>
                <p>ОГРНИП: 325774600908955</p>
                <p>ИНН: 231805728780</p>
              </div>
            </div>

            {/* Контакты */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Контакты</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-xs text-muted-foreground/70 mb-0.5">Поддержка</p>
                    <a href="mailto:ip.kuzmenkoav@yandex.ru" className="break-all hover:text-slate-900 transition-colors">
                      ip.kuzmenkoav@yandex.ru
                    </a>
                  </div>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground pt-1">
                Отвечаем в течение рабочего дня.
              </p>
            </div>
          </div>

          {/* Bottom section */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-sm text-muted-foreground">© 2026 Траектория. Все права защищены.</div>
              <div className="flex items-center gap-4">
                <div className="text-xs text-muted-foreground">
                  Безопасная оплата через ЮKassa
                </div>
                <Link to="/admin/login" className="text-xs text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors select-none">
                  ·
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}