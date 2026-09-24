{
    "name": "ARA Community Gantt View (No Enterprise Required) - Odoo 18",
    "summary": "A lightweight Gantt view for Odoo Community",
    "version": "18.0.1.0.0",
    "category": "Project",
    "license": "LGPL-3",
    "price": 48.00,
    "currency": "USD",
    "depends": ["project", "web"],
    "data": [
        "views/project_task_views.xml",
        "views/project_task_type_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "ara_community_gantt_view_v18/static/src/js/gantt_view.js",
            "ara_community_gantt_view_v18/static/src/xml/gantt_view.xml",
            "ara_community_gantt_view_v18/static/src/scss/gantt_view.scss",
        ],
    },
    "application": False,
    "installable": True,
    "author" : 'ARA SOFT'
}
