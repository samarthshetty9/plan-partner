import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Flame, HeartPulse, Footprints } from "lucide-react";

export default function PatientFitnessTracking() {
  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground">Fitness Tracking</h1>
        <p className="text-muted-foreground text-sm">Monitor your daily activities, workouts, and fitness goals.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
            <Footprints className="w-8 h-8 text-blue-500" />
            <p className="text-sm font-medium text-muted-foreground">Steps</p>
            <p className="text-2xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
            <Flame className="w-8 h-8 text-orange-500" />
            <p className="text-sm font-medium text-muted-foreground">Calories</p>
            <p className="text-2xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
            <Activity className="w-8 h-8 text-green-500" />
            <p className="text-sm font-medium text-muted-foreground">Active Mins</p>
            <p className="text-2xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
            <HeartPulse className="w-8 h-8 text-red-500" />
            <p className="text-sm font-medium text-muted-foreground">Heart Rate</p>
            <p className="text-2xl font-bold">--</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your recently logged workouts and activities.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No fitness activities logged yet.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
