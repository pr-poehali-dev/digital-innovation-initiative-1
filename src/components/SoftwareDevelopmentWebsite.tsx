import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { ArrowRight, ChevronRight, Menu, X, Zap, FileText, Sparkles, Upload, BookOpen, Layers, GraduationCap, Map, Target, Users, Briefcase, Clock, Brain } from "lucide-react"
import { motion, type Variants } from "framer-motion"
import { GridMotion } from "./ui/grid-motion"
import { cn } from "@/lib/utils"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/lib/auth-context"

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

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
)
CardHeader.displayName = "CardHeader"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
)
CardContent.displayName = "CardContent"

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
  { name: "Возможности", href: "#services" },
  { name: "Как это работает", href: "#how-it-works" },
  { name: "Для кого", href: "#about" },
  { name: "Контакты", href: "#contact" },
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

const CardDecorator = ({ children }: { children: React.ReactNode }) => (
  <div
    aria-hidden
    className="relative mx-auto size-36 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"
  >
    <div className="absolute inset-0 [--border:black] dark:[--border:white] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:24px_24px] opacity-10" />
    <div className="bg-background absolute inset-0 m-auto flex size-12 items-center justify-center border-t border-l border-slate-200">
      {children}
    </div>
  </div>
)

export default function SoftwareDevelopmentWebsite() {
  const studyImages = [
    "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/ba4b75b8-8d2b-4603-b9ab-07f5a660cef0.jpg",
    "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/6281ccd8-f392-4b34-88fd-170ccc1992e2.jpg",
    "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/805e5e62-be27-487c-8548-5db747b6ac1b.jpg",
    "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/591f1da1-c305-46ac-bf31-4b8a6e75c400.jpg",
    "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/940fc694-e228-423f-b6ea-e89b5ce9b80a.jpg",
    "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/7c3a1d4f-87c8-4660-a9d3-2cfdc414c421.jpg",
  ]
  // Заполняем сетку 28 элементов (повтор картинок про учёбу)
  const gridItems = Array.from({ length: 28 }, (_, i) => studyImages[i % studyImages.length])

  return (
    <>
      <HeroHeader />
      <main className="overflow-hidden">
        <div
          aria-hidden
          className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block"
        >
          <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(220,13%,18%,.08)_0,hsla(220,13%,18%,.02)_50%,hsla(220,13%,18%,0)_80%)]" />
          <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(220,13%,18%,.06)_0,hsla(220,13%,18%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
        </div>

        <section>
          <div className="relative pt-24 md:pt-36">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]"
            />
            <div className="mx-auto max-w-7xl px-6">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                <AnimatedGroup variants={transitionVariants}>
                  <a
                    href="#services"
                    className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-black/5 transition-all duration-300 dark:border-t-white/5 dark:shadow-zinc-950"
                  >
                    <span className="text-foreground text-sm">Траектория — личный кабинет развития и обучения с AI</span>
                    <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700"></span>

                    <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
                      <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                      </div>
                    </div>
                  </a>

                  <h1 className="mt-8 max-w-4xl mx-auto text-balance text-5xl md:text-6xl lg:mt-16 xl:text-7xl font-bold">
                    Траектория —{" "}
                    <span className="inline-block text-slate-600">
                      ваш путь развития с AI
                    </span>
                  </h1>
                  <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
                    Личный кабинет развития и обучения: проекты, компетенции, карьерный план — AI помогает на каждом шаге.
                  </p>
                </AnimatedGroup>

                <AnimatedGroup
                  variants={{
                    container: {
                      visible: {
                        transition: { staggerChildren: 0.05, delayChildren: 0.75 },
                      },
                    },
                    ...transitionVariants,
                  }}
                  className="mt-10 flex flex-col items-center justify-center gap-3 md:flex-row"
                >
                  <div key={1} className="bg-slate-100 rounded-[14px] border border-slate-200 p-0.5">
                    <Link to="/login">
                      <Button size="lg" className="rounded-xl px-6 text-base bg-slate-800 hover:bg-slate-700">
                        <Sparkles className="mr-2 h-4 w-4" />
                        <span className="text-nowrap">Открыть кабинет</span>
                      </Button>
                    </Link>
                  </div>
                  <a href="#about" key={2}>
                    <Button size="lg" variant="ghost" className="h-10.5 rounded-xl px-5 hover:text-slate-900">
                      <span className="text-nowrap">Узнать подробнее</span>
                    </Button>
                  </a>
                </AnimatedGroup>
              </div>
            </div>

            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: {
                      staggerChildren: 0.05,
                      delayChildren: 0.75,
                    },
                  },
                },
                ...transitionVariants,
              }}
            >
              <div className="relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-20">
                <div
                  aria-hidden
                  className="bg-gradient-to-b to-background absolute inset-0 z-10 from-transparent from-35%"
                />
                <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-slate-200 p-4 shadow-lg shadow-slate-300/30 ring-1">
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 aspect-[15/8] relative rounded-2xl border border-slate-200 overflow-hidden">
                    <GridMotion items={gridItems} gradientColor="rgba(30, 41, 59, 0.08)" className="h-full w-full" />
                  </div>
                </div>
              </div>

            </AnimatedGroup>
          </div>
        </section>

        {/* ── Блок сценариев ── */}
        <section id="services" className="py-16 md:py-24 bg-background">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-12">
              <span className="inline-block text-xs font-semibold tracking-wide text-slate-500 uppercase mb-3">С чего начать</span>
              <h2 className="text-balance text-3xl md:text-4xl font-bold">Что вы хотите сделать?</h2>
              <p className="mt-3 text-muted-foreground">Выберите сценарий — система проведёт по всем шагам</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  emoji: "✨",
                  color: "bg-orange-50 border-orange-200 hover:border-orange-400",
                  iconBg: "bg-orange-100",
                  title: "Создать презентацию",
                  desc: "Загрузите материалы — AI соберёт PPTX с текстом, структурой и схемами",
                  cta: "Начать →",
                  link: "/cabinet",
                  ctaCls: "bg-orange-600 hover:bg-orange-700 text-white",
                },
                {
                  emoji: "🛡",
                  color: "bg-blue-50 border-blue-200 hover:border-blue-400",
                  iconBg: "bg-blue-100",
                  title: "Проверить готовую",
                  desc: "Загрузите PPTX — AI найдёт ошибки, противоречия и несоответствия критериям",
                  cta: "Проверить →",
                  link: "/cabinet",
                  ctaCls: "bg-blue-600 hover:bg-blue-700 text-white",
                },
                {
                  emoji: "🔧",
                  color: "bg-violet-50 border-violet-200 hover:border-violet-400",
                  iconBg: "bg-violet-100",
                  title: "Исправить замечания",
                  desc: "После аудита — AI составит план правок и создаст улучшенную версию",
                  cta: "Исправить →",
                  link: "/cabinet",
                  ctaCls: "bg-violet-600 hover:bg-violet-700 text-white",
                },
                {
                  emoji: "📚",
                  color: "bg-green-50 border-green-200 hover:border-green-400",
                  iconBg: "bg-green-100",
                  title: "Загрузить материалы",
                  desc: "Конспекты, статьи, стандарты, шаблоны — всё станет базой для AI",
                  cta: "Загрузить →",
                  link: "/cabinet",
                  ctaCls: "bg-green-600 hover:bg-green-700 text-white",
                },
                {
                  emoji: "🎨",
                  color: "bg-pink-50 border-pink-200 hover:border-pink-400",
                  iconBg: "bg-pink-100",
                  title: "Добавить визуалы",
                  desc: "Схемы, диаграммы, таймлайны — AI вставит их прямо в слайды",
                  cta: "Открыть →",
                  link: "/cabinet/visuals",
                  ctaCls: "bg-pink-600 hover:bg-pink-700 text-white",
                },
                {
                  emoji: "🔍",
                  color: "bg-slate-50 border-slate-200 hover:border-slate-400",
                  iconBg: "bg-slate-100",
                  title: "Найти в материалах",
                  desc: "Умный поиск по всем документам проекта — без ручного просмотра",
                  cta: "Искать →",
                  link: "/cabinet",
                  ctaCls: "bg-slate-700 hover:bg-slate-800 text-white",
                },
              ].map((s) => (
                <Link
                  key={s.title}
                  to={s.link}
                  className={`group flex flex-col border-2 rounded-2xl p-5 transition-all duration-200 ${s.color}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4 ${s.iconBg}`}>
                    {s.emoji}
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1.5">{s.title}</h3>
                  <p className="text-sm text-slate-600 flex-1 mb-4">{s.desc}</p>
                  <span className={`self-start text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${s.ctaCls}`}>
                    {s.cta}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="solutions" className="bg-muted/50 py-16 md:py-32 dark:bg-transparent">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center">
              <h2 className="text-balance text-4xl font-semibold lg:text-5xl">
                Всё для учёбы — <span className="text-slate-600">в одном месте</span>
              </h2>
              <p className="mt-4 text-muted-foreground">
                Собирай базу знаний, задавай умные задания AI и получай зачёты, дипломы и презентации — всё с учётом твоих стандартов.
              </p>
            </div>
            <Card className="mx-auto mt-8 grid max-w-sm divide-y overflow-hidden shadow-zinc-950/5 border-slate-200 *:text-center md:mt-16 md:max-w-full md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Upload className="size-6 text-slate-800" aria-hidden />
                  </CardDecorator>

                  <h3 className="mt-6 font-medium">База знаний студента</h3>
                </CardHeader>

                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Храни конспекты, лекции, статьи, раздаточные материалы в одном месте. Всё доступно для AI в любой момент.
                  </p>
                </CardContent>
              </div>

              <div className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <BookOpen className="size-6 text-slate-800" aria-hidden />
                  </CardDecorator>

                  <h3 className="mt-6 font-medium">Умные задания AI</h3>
                </CardHeader>

                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Скажи: «Подготовь диплом по теме X, учти стандарт IPMO, возьми структуру из моей презентации» — AI соберёт всё по твоей формуле.
                  </p>
                </CardContent>
              </div>

              <div className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Sparkles className="size-6 text-slate-800" aria-hidden />
                  </CardDecorator>

                  <h3 className="mt-6 font-medium">Правки и версии</h3>
                </CardHeader>

                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Получил черновик — дай правки. AI сохраняет историю версий и дорабатывает пока не устроит результат.
                  </p>
                </CardContent>
              </div>
            </Card>
          </div>
        </section>

        {/* Секция: пример промпта */}
        <section id="how-it-works" className="py-16 md:py-24 bg-background">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-12">
              <span className="inline-block text-xs font-semibold tracking-wide text-slate-500 uppercase mb-3">Как это работает</span>
              <h2 className="text-balance text-3xl md:text-4xl font-semibold">
                Задавай задание AI как <span className="text-slate-600">формулу из своих материалов</span>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                Загрузи стандарты, презентации-образцы и материалы по теме — AI соберёт всё в один результат по твоим правилам.
              </p>
            </div>

            <div className="grid md:grid-cols-5 gap-6 items-stretch">
              {/* Левая часть: документы */}
              <div className="md:col-span-2 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">📁 В кабинете загружено</p>
                <div className="border border-slate-200 rounded-xl p-3.5 bg-card flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/30 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Стандарт IPMO.pdf</p>
                    <p className="text-xs text-slate-500">Роль: нормативный документ</p>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-xl p-3.5 bg-card flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0">
                    <Layers className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Прошлая презентация.pptx</p>
                    <p className="text-xs text-slate-500">Роль: образец структуры и стиля</p>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-xl p-3.5 bg-card flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950/30 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Конспект лекций.docx</p>
                    <p className="text-xs text-slate-500">Роль: содержательный материал</p>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-xl p-3.5 bg-card flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950/30 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Статьи по теме.pdf</p>
                    <p className="text-xs text-slate-500">Роль: содержательный материал</p>
                  </div>
                </div>
              </div>

              {/* Правая часть: промпт */}
              <div className="md:col-span-3 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">✨ Промпт для AI</p>
                <div className="border-2 border-slate-800 rounded-2xl bg-slate-900 text-white p-6 shadow-xl">
                  <p className="text-sm leading-relaxed font-mono">
                    Подготовь <span className="bg-slate-700 px-1.5 py-0.5 rounded text-yellow-300 font-semibold">дипломную работу</span> на тему{" "}
                    <span className="bg-slate-700 px-1.5 py-0.5 rounded text-blue-300 font-semibold">«Цифровая трансформация управления проектами»</span>.
                    <br /><br />
                    Учти стандарт <span className="bg-slate-700 px-1.5 py-0.5 rounded text-purple-300 font-semibold">IPMO</span>,
                    возьми структуру и стиль оформления из <span className="bg-slate-700 px-1.5 py-0.5 rounded text-cyan-300 font-semibold">прилагаемой презентации</span>.
                    <br /><br />
                    Используй <span className="bg-slate-700 px-1.5 py-0.5 rounded text-green-300 font-semibold">мои материалы</span> как содержательную базу и
                    <span className="bg-slate-700 px-1.5 py-0.5 rounded text-orange-300 font-semibold"> дополни актуальными источниками из интернета</span>.
                    <br /><br />
                    Объём — 60 страниц, академический стиль, добавь введение, 3 главы, заключение и список литературы.
                  </p>
                </div>

                <div className="flex items-center gap-3 text-sm text-slate-600 pl-2">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <ChevronRight className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <span>AI анализирует все 4 документа + ищет дополнения в сети</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 pl-2">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <ChevronRight className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <span>Предлагает 1-3 варианта структуры на выбор</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 pl-2">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <ChevronRight className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <span>Генерирует диплом + презентацию защиты по стилю образца</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 pl-2">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <ChevronRight className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <span>Принимает правки и сохраняет историю версий</span>
                </div>

                <div className="pt-4">
                  <Link to="/cabinet">
                    <Button size="lg" className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-6">
                      Открыть кабинет
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ── Блок «Для кого» ── */}
        <section id="about" className="py-16 md:py-24 bg-muted/30">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-12">
              <span className="inline-block text-xs font-semibold tracking-wide text-slate-500 uppercase mb-3">Для кого</span>
              <h2 className="text-balance text-3xl md:text-4xl font-bold">Траектория для каждого,{" "}
                <span className="text-slate-600">кто развивается</span>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
                Неважно — студент, преподаватель или специалист. Траектория адаптируется под ваши цели.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  icon: <GraduationCap className="h-6 w-6 text-blue-600" />,
                  bg: "bg-blue-50",
                  title: "Студенты",
                  desc: "Загружайте конспекты и стандарты, создавайте дипломы и презентации с AI, поддерживайте знания тестами.",
                },
                {
                  icon: <BookOpen className="h-6 w-6 text-violet-600" />,
                  bg: "bg-violet-50",
                  title: "Преподаватели",
                  desc: "Формируйте учебные материалы, создавайте задания и методические презентации по своим стандартам.",
                },
                {
                  icon: <Target className="h-6 w-6 text-green-600" />,
                  bg: "bg-green-50",
                  title: "Методисты",
                  desc: "Выстраивайте образовательные треки, собирайте базы знаний и проверяйте соответствие требованиям.",
                },
                {
                  icon: <Briefcase className="h-6 w-6 text-orange-600" />,
                  bg: "bg-orange-50",
                  title: "Специалисты",
                  desc: "Развивайте компетенции, планируйте карьерный рост и собирайте подтверждения своей квалификации.",
                },
              ].map((item) => (
                <div key={item.title} className="bg-background rounded-2xl border border-slate-200 p-6 flex flex-col gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.bg}`}>
                    {item.icon}
                  </div>
                  <h3 className="font-semibold text-slate-800">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed flex-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Роадмап: доступно сейчас / в разработке ── */}
        <section className="py-16 md:py-24 bg-background">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-12">
              <span className="inline-block text-xs font-semibold tracking-wide text-slate-500 uppercase mb-3">Платформа</span>
              <h2 className="text-balance text-3xl md:text-4xl font-bold">Одна платформа —{" "}
                <span className="text-slate-600">весь путь развития</span>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
                Сейчас уже работает модуль учебных проектов. Траектория расширяется с каждым месяцем.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Доступно сейчас */}
              <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-sm font-semibold text-green-700">Доступно сейчас</span>
                </div>
                <ul className="space-y-3">
                  {[
                    { icon: <FileText className="h-4 w-4" />, text: "Учебные проекты и презентации" },
                    { icon: <Upload className="h-4 w-4" />, text: "Загрузка материалов и документов" },
                    { icon: <Sparkles className="h-4 w-4" />, text: "AI-генерация по вашим материалам" },
                    { icon: <Layers className="h-4 w-4" />, text: "Визуалы: схемы, диаграммы, таймлайны" },
                    { icon: <Zap className="h-4 w-4" />, text: "Аудит и проверка презентаций" },
                    { icon: <BookOpen className="h-4 w-4" />, text: "Чат с документом по вашим файлам" },
                  ].map((item) => (
                    <li key={item.text} className="flex items-center gap-3 text-sm text-slate-700">
                      <span className="text-green-600 flex-shrink-0">{item.icon}</span>
                      {item.text}
                    </li>
                  ))}
                </ul>
                <Link to="/login" className="mt-6 inline-block">
                  <button className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                    Открыть кабинет →
                  </button>
                </Link>
              </div>

              {/* В разработке */}
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-500">Готовится к запуску</span>
                </div>
                <ul className="space-y-3">
                  {[
                    { icon: <GraduationCap className="h-4 w-4" />, text: "Дипломы и сертификаты — хранение и учёт" },
                    { icon: <Brain className="h-4 w-4" />, text: "Тесты для поддержания знаний" },
                    { icon: <Map className="h-4 w-4" />, text: "Карта компетенций" },
                    { icon: <Target className="h-4 w-4" />, text: "План развития и карьерный трек" },
                    { icon: <Users className="h-4 w-4" />, text: "Профессиональный профиль" },
                    { icon: <Briefcase className="h-4 w-4" />, text: "Взаимодействие с работодателями" },
                  ].map((item) => (
                    <li key={item.text} className="flex items-center gap-3 text-sm text-slate-500">
                      <span className="text-slate-400 flex-shrink-0">{item.icon}</span>
                      {item.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-xs text-slate-400">Следите за обновлениями — Траектория расширяется каждый месяц.</p>
              </div>
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
                Траектория — личный кабинет развития и обучения с AI. Учёба, компетенции, карьерный план и проекты — всё в одном месте.
              </p>
            </div>

            {/* Навигация */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Навигация</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#services" className="text-muted-foreground hover:text-slate-900 transition-colors">
                    Возможности
                  </a>
                </li>
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
              <div className="text-xs text-muted-foreground">
                Безопасная оплата через ЮKassa
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}