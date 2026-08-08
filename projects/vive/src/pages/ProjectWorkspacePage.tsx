import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useSetup } from "../components/SetupProvider";
import { WorkspaceShell } from "../components/workspace/WorkspaceShell";
import { getProject, setLastProjectId } from "../lib/project";

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{
    projectId: string;
  }>();
  const { requestCredentials, needsApiKey } = useSetup();

  useEffect(() => {
    if (projectId) setLastProjectId(projectId);
  }, [projectId]);

  if (!projectId) {
    return <Navigate to="/app" replace />;
  }

  const project = getProject(projectId);
  if (!project) {
    return <Navigate to="/app" replace />;
  }

  return (
    <WorkspaceShell
      project={project}
      onOpenSettings={requestCredentials}
      showSetupIndicator={needsApiKey}
    />
  );
}
