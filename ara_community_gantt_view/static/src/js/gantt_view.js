import { Component, onWillStart, useState } from "@odoo/owl"
import { Layout } from "@web/search/layout"
import { standardViewProps } from "@web/views/standard_view_props"
import { useService } from "@web/core/utils/hooks"
import { registry } from "@web/core/registry"

const DAY = 24 * 60 * 60 * 1000

function asDate(value) {
    return value ? new Date(value.replace(" ", "T") + "Z") : null
}

function startOfDay(date) {
    const result = new Date(date)
    result.setHours(0, 0, 0, 0)
    return result
}

function formatDate(date) {
    return String(date.getDate()).padStart(2, "0")
}

function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(date) {
    return date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    })
}

function dateInputValue(date) {
    if (!date) {
        return ""
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function dateFromInput(value) {
    return value ? new Date(`${value}T00:00:00`) : null
}

class CommunityGanttRenderer extends Component {
    static template = "ara_community_gantt_view.Renderer"
    static props = {
        tasks: Array,
        taskGroups: Array,
        showProjectGroups: Boolean,
        timeline: Array,
        monthSegments: Array,
        rangeStart: Date,
        rangeDays: Number,
        milestones: Array,
        assigneeNames: Object,
        openTask: Function,
    }

    taskStyle(task) {
        const start = asDate(task.create_date) || this.props.rangeStart
        const end =
            asDate(task.date_end) ||
            asDate(task.date_deadline) ||
            new Date(start.getTime() + DAY)
        const rangeEnd = new Date(
            this.props.rangeStart.getTime() + this.props.rangeDays * DAY
        )
        if (end <= this.props.rangeStart || start >= rangeEnd) {
            return "display: none"
        }
        const visibleStart = new Date(
            Math.max(start.getTime(), this.props.rangeStart.getTime())
        )
        const visibleEnd = new Date(Math.min(end.getTime(), rangeEnd.getTime()))
        const left = Math.max(
            0,
            ((visibleStart - this.props.rangeStart) / DAY) * 30
        )
        const width = Math.min(
            this.props.rangeDays * 30 - left,
            Math.max(30, ((visibleEnd - visibleStart) / DAY) * 30)
        )
        return `left: ${left}px; width: ${width}px`
    }

    taskProgress(task) {
        if (task.is_closed) {
            return 100
        }
        return Math.max(0, Math.min(100, Number(task.stage_progress ?? 0)))
    }

    progressClass(task) {
        const progress = this.taskProgress(task)
        if (progress === 0) {
            return "o_community_gantt_bar_progress_0"
        }
        if (progress <= 75) {
            return "o_community_gantt_bar_progress_75"
        }
        return "o_community_gantt_bar_progress_100"
    }

    taskTooltip(task) {
        const projectName = task.project_id?.[1] || "No project"
        const stageName = task.stage_id?.[1] || "No stage"
        return [
            `Project: ${projectName}`,
            `Task: ${task.name}`,
            `Progress: ${this.taskProgress(task)}%`,
            `Stage: ${stageName}`,
        ].join("\n")
    }

    taskAssignees(task) {
        return (
            (task.user_ids || [])
                .map(user => {
                    const userId = Array.isArray(user) ? user[0] : user
                    const tupleName = Array.isArray(user) ? user[1] : null
                    return (
                        tupleName ||
                        this.props.assigneeNames[userId] ||
                        (userId ? `User #${userId}` : "")
                    )
                })
                .filter(Boolean)
                .join(", ") || "Unassigned"
        )
    }

    allocatedHours(task) {
        const hours = Number(task.allocated_hours || 0)
        return `${hours.toFixed(1)} h`
    }

    milestoneStyle(milestone) {
        const date = asDate(milestone.deadline)
        const left = ((date - this.props.rangeStart) / DAY) * 30
        return `left: ${left}px`
    }

    rowClass(task) {
        return task.parent_id
            ? "o_community_gantt_child"
            : "o_community_gantt_parent"
    }
}

class CommunityGanttController extends Component {
    static components = { Layout, Renderer: CommunityGanttRenderer }
    static props = { ...standardViewProps }
    static template = "ara_community_gantt_view.Controller"

    setup() {
        this.orm = useService("orm")
        this.action = useService("action")
        this.openTask = this.openTask.bind(this)
        this.state = useState({
            tasks: [],
            projectId: "all",
            year: "all",
            month: "all",
            assigneeId: "all",
            milestoneId: "all",
            milestones: [],
            assignees: [],
            dateFrom: "",
            dateTo: "",
            filtersOpen: false,
        })
        onWillStart(() => this.loadTasks())
    }

    async loadTasks() {
        const fields = [
            "name",
            "project_id",
            "create_date",
            "date_end",
            "date_deadline",
            "parent_id",
            "stage_id",
            "user_ids",
            "allocated_hours",
            "is_closed",
            "milestone_id",
        ]
        const tasks = await this.orm.searchRead(
            "project.task",
            this.props.domain || [],
            fields,
            {
                order: "create_date, id",
                limit: 500,
            }
        )
        const stageIds = [
            ...new Set(tasks.map(task => task.stage_id?.[0]).filter(Boolean)),
        ]
        const stages = stageIds.length
            ? await this.orm.read("project.task.type", stageIds, [
                  "stage_progress",
              ])
            : []
        const progressByStage = new Map(
            stages.map(stage => [stage.id, stage.stage_progress])
        )
        this.state.tasks = tasks.map(task => ({
            ...task,
            stage_progress: progressByStage.get(task.stage_id?.[0]) ?? 0,
        }))
        this.state.assignees = await this.orm.searchRead(
            "res.users",
            [],
            ["name"],
            {
                order: "name, id",
                limit: 2000,
            }
        )
        const milestoneIds = [
            ...new Set(
                tasks.map(task => task.milestone_id?.[0]).filter(Boolean)
            ),
        ]
        this.state.milestones = milestoneIds.length
            ? await this.orm.read("project.milestone", milestoneIds, [
                  "deadline",
              ])
            : []
    }

    get visibleTasks() {
        return this.state.tasks.filter(task => {
            const projectMatches =
                this.state.projectId === "all" ||
                task.project_id?.[0] === Number(this.state.projectId)
            const taskYear = asDate(task.create_date)?.getFullYear().toString()
            const yearMatches =
                this.state.year === "all" || taskYear === this.state.year
            const assigneeMatches =
                this.state.assigneeId === "all" ||
                task.user_ids?.some(user => {
                    const userId = Array.isArray(user)
                        ? user[0]
                        : typeof user === "object"
                          ? user.id
                          : user
                    return userId === Number(this.state.assigneeId)
                })
            const milestoneMatches =
                this.state.milestoneId === "all" ||
                task.milestone_id?.[0] === Number(this.state.milestoneId)
            const taskStart = asDate(task.create_date)
            const taskEnd =
                asDate(task.date_end) || asDate(task.date_deadline) || taskStart
            const filterStart = dateFromInput(this.state.dateFrom)
            const filterEnd = dateFromInput(this.state.dateTo)
            const datesMatch =
                (!filterStart || taskEnd >= filterStart) &&
                (!filterEnd ||
                    taskStart <= new Date(filterEnd.getTime() + DAY - 1))
            return (
                projectMatches &&
                yearMatches &&
                assigneeMatches &&
                milestoneMatches &&
                datesMatch
            )
        })
    }

    get taskGroups() {
        if (this.state.projectId !== "all") {
            return [
                { id: "selected-project", name: "", tasks: this.visibleTasks },
            ]
        }
        const groups = new Map()
        for (const task of this.visibleTasks) {
            const id = task.project_id?.[0] || "no-project"
            const name = task.project_id?.[1] || "No project"
            if (!groups.has(id)) {
                groups.set(id, { id, name, tasks: [] })
            }
            groups.get(id).tasks.push(task)
        }
        return [...groups.values()].sort((first, second) =>
            first.name.localeCompare(second.name)
        )
    }

    get assignees() {
        return this.state.assignees
            .map(user => ({ id: user.id, name: user.name }))
            .sort((first, second) => first.name.localeCompare(second.name))
    }

    get assigneeNames() {
        return Object.fromEntries(
            this.state.assignees.map(user => [user.id, user.name])
        )
    }

    get milestones() {
        const names = new Map()
        for (const task of this.state.tasks) {
            if (task.milestone_id) {
                names.set(task.milestone_id[0], task.milestone_id[1])
            }
        }
        return [...names]
            .sort((first, second) => first[1].localeCompare(second[1]))
            .map(([id, name]) => ({ id, name }))
    }

    get visibleMilestones() {
        const visibleIds = new Set(
            this.visibleTasks
                .map(task => task.milestone_id?.[0])
                .filter(Boolean)
        )
        const rangeEnd = new Date(
            this.rangeStart.getTime() + this.rangeDays * DAY
        )
        return this.state.milestones.filter(milestone => {
            const date = asDate(milestone.deadline)
            return (
                visibleIds.has(milestone.id) &&
                date >= this.rangeStart &&
                date < rangeEnd
            )
        })
    }

    get projects() {
        const projects = new Map()
        for (const task of this.state.tasks) {
            if (task.project_id) {
                projects.set(task.project_id[0], task.project_id[1])
            }
        }
        return [...projects].map(([id, name]) => ({ id, name }))
    }

    taskProgress(task) {
        if (task.is_closed) {
            return 100
        }
        return Math.max(0, Math.min(100, Number(task.stage_progress ?? 0)))
    }

    get projectSummaries() {
        const summaries = new Map()
        for (const task of this.state.tasks) {
            if (!task.project_id) {
                continue
            }
            const projectId = task.project_id[0]
            const summary = summaries.get(projectId) || {
                id: projectId,
                name: task.project_id[1],
                totalProgress: 0,
                taskCount: 0,
            }
            summary.totalProgress += this.taskProgress(task)
            summary.taskCount += 1
            summaries.set(projectId, summary)
        }
        return [...summaries.values()]
            .map(summary => ({
                ...summary,
                progress: Math.round(summary.totalProgress / summary.taskCount),
            }))
            .sort((first, second) => first.name.localeCompare(second.name))
    }

    get selectedProjectSummary() {
        if (this.state.projectId === "all") {
            const tasks = this.state.tasks
            return {
                name: "All projects",
                progress: tasks.length
                    ? Math.round(
                          tasks.reduce(
                              (total, task) => total + this.taskProgress(task),
                              0
                          ) / tasks.length
                      )
                    : 0,
                taskCount: tasks.length,
            }
        }
        return (
            this.projectSummaries.find(
                project => project.id === Number(this.state.projectId)
            ) || { name: "Selected project", progress: 0, taskCount: 0 }
        )
    }

    toggleFilters() {
        this.state.filtersOpen = !this.state.filtersOpen
    }

    get activeFilters() {
        const filters = []
        if (this.state.assigneeId !== "all") {
            const assignee = this.assignees.find(
                item => item.id === Number(this.state.assigneeId)
            )
            if (assignee) {
                filters.push(`Assignee: ${assignee.name}`)
            }
        }
        if (this.state.milestoneId !== "all") {
            const milestone = this.milestones.find(
                item => item.id === Number(this.state.milestoneId)
            )
            if (milestone) {
                filters.push(`Milestone: ${milestone.name}`)
            }
        }
        if (this.state.year !== "all") {
            filters.push(`Year: ${this.state.year}`)
        }
        if (this.state.month !== "all") {
            const month = this.months.find(item => item.id === this.state.month)
            if (month) {
                filters.push(`Month: ${month.name}`)
            }
        }
        return filters
    }

    get months() {
        const months = new Map()
        for (const task of this.state.tasks) {
            const date = asDate(task.create_date)
            if (
                date &&
                (this.state.year === "all" ||
                    date.getFullYear().toString() === this.state.year)
            ) {
                months.set(monthKey(date), monthLabel(date))
            }
        }
        return [...months]
            .sort(([first], [second]) => first.localeCompare(second))
            .map(([id, name]) => ({ id, name }))
    }

    get years() {
        return [
            ...new Set(
                this.state.tasks
                    .map(task => asDate(task.create_date)?.getFullYear())
                    .filter(Boolean)
            ),
        ]
            .sort((first, second) => first - second)
            .map(year => ({ id: String(year), name: String(year) }))
    }

    get rangeStart() {
        const selectedStart = dateFromInput(this.state.dateFrom)
        if (selectedStart) {
            return selectedStart
        }
        return new Date(this.calendarYear, 0, 1)
    }

    get rangeDays() {
        const selectedStart = dateFromInput(this.state.dateFrom)
        const selectedEnd = dateFromInput(this.state.dateTo)
        if (selectedStart && selectedEnd) {
            return Math.max(
                1,
                Math.floor((selectedEnd - selectedStart) / DAY) + 1
            )
        }
        if (!selectedStart && !selectedEnd) {
            const start = new Date(this.calendarYear, 0, 1)
            const end = new Date(this.calendarYear + 1, 0, 1)
            return Math.floor((end - start) / DAY)
        }
        const dates = this.visibleTasks
            .flatMap(task => [
                asDate(task.create_date),
                asDate(task.date_end),
                asDate(task.date_deadline),
            ])
            .filter(Boolean)
        const last = dates.length
            ? new Date(Math.max(...dates))
            : new Date(this.rangeStart.getTime() + 14 * DAY)
        return Math.max(14, Math.ceil((last - this.rangeStart) / DAY) + 4)
    }

    get calendarYear() {
        if (this.state.year !== "all") {
            return Number(this.state.year)
        }
        const selectedStart = dateFromInput(this.state.dateFrom)
        return selectedStart?.getFullYear() || new Date().getFullYear()
    }

    get timeline() {
        return Array.from({ length: this.rangeDays }, (_, index) => {
            const date = new Date(this.rangeStart.getTime() + index * DAY)
            return {
                date,
                label: formatDate(date),
                weekend: [0, 6].includes(date.getDay()),
            }
        })
    }

    get monthSegments() {
        const segments = []
        for (const day of this.timeline) {
            const key = monthKey(day.date)
            const current = segments[segments.length - 1]
            if (current?.id === key) {
                current.days += 1
            } else {
                segments.push({ id: key, label: monthLabel(day.date), days: 1 })
            }
        }
        return segments
    }

    setProject(event) {
        this.state.projectId = event.target.value
    }

    setAssignee(event) {
        this.state.assigneeId = event.target.value
    }

    setMilestone(event) {
        this.state.milestoneId = event.target.value
    }

    setYear(event) {
        this.state.year = event.target.value
        this.state.month = "all"
        if (this.state.year === "all") {
            this.state.dateFrom = ""
            this.state.dateTo = ""
            return
        }
        const year = Number(this.state.year)
        this.state.dateFrom = dateInputValue(new Date(year, 0, 1))
        this.state.dateTo = dateInputValue(new Date(year, 11, 31))
    }

    setMonth(event) {
        this.state.month = event.target.value
        if (this.state.month === "all") {
            if (this.state.year === "all") {
                this.state.dateFrom = ""
                this.state.dateTo = ""
            } else {
                const year = Number(this.state.year)
                this.state.dateFrom = dateInputValue(new Date(year, 0, 1))
                this.state.dateTo = dateInputValue(new Date(year, 11, 31))
            }
            return
        }
        const [year, month] = this.state.month.split("-").map(Number)
        this.state.year = String(year)
        this.state.dateFrom = dateInputValue(new Date(year, month - 1, 1))
        this.state.dateTo = dateInputValue(new Date(year, month, 0))
    }

    setDateRange(field, event) {
        this.state[field] = event.target.value
        this.state.month = "all"
    }

    openTask(task) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "project.task",
            res_id: task.id,
            views: [[false, "form"]],
            target: "current",
        })
    }
}

const CommunityGanttView = {
    type: "community_gantt",
    display_name: "Gantt",
    icon: "fa fa-tasks",
    multiRecord: true,
    searchMenuTypes: ["filter", "favorite"],
    Controller: CommunityGanttController,
    Renderer: CommunityGanttRenderer,
    ArchParser: class {
        parse() {
            return {}
        }
    },
}

registry.category("views").add("community_gantt", CommunityGanttView)
