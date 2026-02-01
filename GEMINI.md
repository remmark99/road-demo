# Gemini Project Summary: Road Condition Monitoring Demo

This document provides a summary of the "road-demo" project, a web application for monitoring road conditions in the city of Surgut using video cameras.

## Project Overview

The project is a Next.js application built with React, TypeScript, and Tailwind CSS. It aims to demonstrate a system that uses ML and CV algorithms to analyze video feeds from city cameras to detect events like snowplows, snow piles, puddles, and potholes.

The application has three main sections:

1.  **Map View:** Displays a map of Surgut with camera locations. Users can select a camera and view its live stream and historical notifications. A timeline slider allows users to view the road status at different times.
2.  **Dashboard:** Presents "sick looking" analytics and metrics about road conditions. This includes statistics on road status, incident reports, and comparisons between different road segments.
3.  **Notifications:** A real-time notification system that alerts users about detected events. The PoC uses mock data, but the vision is to support notifications via various platforms like Telegram or email.

## Key Technologies

*   **Framework:** Next.js
*   **Language:** TypeScript
*   **UI:** React, Tailwind CSS, Radix UI
*   **Charting:** Recharts
*   **Mapping:** MapLibre GL
*   **Linting:** ESLint

## File Structure

The project follows a standard Next.js `app` directory structure.

```
/home/vi/Projects/road-demo/
├───.gitignore
├───components.json
├───eslint.config.mjs
├───map.json
├───next.config.ts
├───package-lock.json
├───package.json
├───pnpm-lock.yaml
├───postcss.config.mjs
├───README.md
├───tsconfig.json
├───.git/...
├───.next/...
├───app/
│   ├───favicon.ico
│   ├───globals.css
│   ├───layout.tsx
│   ├───page.tsx
│   ├───dashboard/
│   │   └───page.tsx
│   └───notifications/
│       └───page.tsx
├───components/
│   ├───navigation.tsx
│   ├───dashboard/
│   │   ├───incidents-chart.tsx
│   │   ├───segment-comparison-chart.tsx
│   │   ├───stats-cards.tsx
│   │   └───status-time-chart.tsx
│   ├───map/
│   │   ├───legend.tsx
│   │   ├───surgut-map.tsx
│   │   ├───timeline-slider.tsx
│   │   └───video-modal.tsx
│   ├───notifications/
│   │   ├───notification-card.tsx
│   │   └───notification-filters.tsx
│   └───ui/
│       ├───badge.tsx
│       ├───button.tsx
│       ├───card.tsx
│       ├───chart.tsx
│       ├───dialog.tsx
│       ├───scroll-area.tsx
│       ├───separator.tsx
│       ├───slider.tsx
│       └───tabs.tsx
├───lib/
│   ├───mock-data.ts
│   ├───types.ts
│   └───utils.ts
├───node_modules/...
└───public/...
```

## Potential Ideas & Improvements

Given the project is in its early stages, here are some ideas to enhance the demo:

*   **Realistic Mock Data:** Instead of simple mock data, simulate more realistic event sequences. This could involve creating scenarios like a snowplow clearing a specific route, with corresponding changes in road status.
*   **Interactive Map:**
    *   Allow users to draw a polygon on the map to subscribe to notifications for a specific area.
    *   Show camera frustums on the map to visualize the area covered by each camera.
    *   Animate the map to show the progression of events over time, like the path of a snowplow.
*   **Enhanced Notifications:**
    *   Implement a real-time notification panel that slides in from the side when a new event occurs.
    *   Add more notification channels, like browser push notifications, in addition to the planned email and Telegram.
    *   Allow users to customize notification settings, such as choosing which types of events to be notified about.
*   **Gamification/User Engagement:**
    *   Introduce a "pothole reporting" feature where users can upvote or confirm the existence of potholes, turning it into a crowdsourced data validation system.
    *   Create a public "City Health" score based on the road conditions, which could be shared on social media.
*   **"Sick" Dashboard Features:**
    *   **Heatmaps:** Visualize the concentration of incidents (potholes, puddles) on the map.
    *   **Predictive Analytics:** Use historical data to predict which road segments are most likely to have issues in the near future (e.g., based on weather forecasts).
    *   **Resource Allocation:** A simulation tool that suggests optimal routes for snowplows or repair crews based on the current road conditions.

This summary should provide a good starting point for understanding the project and its potential.
