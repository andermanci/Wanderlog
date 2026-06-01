import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={es}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-2',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center w-full',
        caption_label: 'text-sm font-medium capitalize',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-7 p-0 opacity-60 hover:opacity-100 absolute left-1'
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-7 p-0 opacity-60 hover:opacity-100 absolute right-1'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground w-8 font-normal text-[0.8rem] text-center pb-1',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center text-sm [&:has([aria-selected])]:rounded-md',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-8 p-0 font-normal aria-selected:opacity-100'
        ),
        selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md',
        today: 'bg-accent/20 text-accent-foreground rounded-md',
        outside: 'text-muted-foreground opacity-40',
        disabled: 'text-muted-foreground opacity-30',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left'
            ? <ChevronLeft className='size-4' />
            : <ChevronRight className='size-4' />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
