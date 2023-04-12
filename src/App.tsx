import React, { useEffect, useState } from 'react';
import './App.css';
import { fetchIssues } from './fetch_issues';
import { components } from './github';
import Chart from './chart';
import { ChartProps } from './chart';
import * as d3 from "d3";
import ViolinChart from './ViolinChart';

type Issue = components['schemas']['pull-request'];

interface IssueState {
  issues: Issue[],
  teams: string[],
  statuses: string[],
}

enum SplitBy {
  TEAM = "Team",
  STATUS = "Status",
  AUTHOR = "Author",
  REVIEWER = "Reviewer",
}

enum ViewDate {
  CREATED_ON = "Date Created",
  UPDATED_ON = "Date Updated",
}

interface Datum {
  date: Date,
  value: number,
  index: number,
  size: number,
}

interface SimplePullRequest {
  'number': number,
  'user': string,
  'assignee': string | null,
  'created_at': string,
  'closed_at': string | null,
  'merged_at': string | null,
  'title': string | null,
  'labels': { name?: string }[],
}

interface AllPullRequestsState {
  prs: SimplePullRequest[],
  teams: string[],
  statuses: string[],
}

const NO_TEAM = "No Team";
const NO_STATUS = "No Status";

const uniqueSorted = (values: string[], sortByCounts: boolean = false): string[] => {
  const counts = values.reduce((counts, name) => {
    counts[name] = (counts[name] || 0) + 1;
    return counts;
  }, {} as any);

  const uniques = Object.keys(counts);
  if (sortByCounts) {
    uniques.sort((a, b) => counts[a] === counts[b] ? a.localeCompare(b) : counts[b] - counts[a]);
  } else {
    uniques.sort((a, b) => a.localeCompare(b));
  }

  return uniques;
};

const orNone = (categories: string[], none: string): string[] => categories.length === 0 ? [none] : categories;

const teamLabels = (issue: { labels: { name?: string }[] }): string[] => orNone(issue.labels.map(value => value.name).filter(value => value && value.startsWith('T-')).map(value => value!!), NO_TEAM);
const statusLabels = (issue: { labels: { name?: string }[] }): string[] => orNone(issue.labels.map(value => value.name).filter(value => value && value.startsWith('S-')).map(value => value!!), NO_STATUS);

function sorted<T>(array: T[]): T[] {
  let newArray = Array.from(array);
  newArray.sort();
  return newArray;
}

const Checkbox: React.FC<{ values: string[], checked: string[], setChecked: (checked: string[]) => void }> = ({ values, checked, setChecked }) => {
  const toggle = (value: string) => {
    if (checked.includes(value)) {
      setChecked(checked.filter(c => c !== value));
    } else {
      setChecked(checked.concat([value]));
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {values.length > 1 && (
        <div style={{ display: 'inline', }}>
          <input type="checkbox" checked={values.every(value => checked.includes(value))} onChange={() => values.every(value => checked.includes(value)) ? setChecked([]) : setChecked(values)} />
          <span style={{ color: 'white' }}>All</span>
        </div>
      )}
      <div>
        <ul style={{ margin: 0, padding: 0, listStyleType: 'none' }}>
          {values.map(value => (
            <li key={value}>
              <input type="checkbox" id={value} name={value} value={value} checked={checked.includes(value)} onChange={() => toggle(value)} />
              <span style={{ color: 'white' }}>{value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const Radio: React.FC<{ values: string[], selected: string, setSelected: (selected: string) => void }> = ({ values, selected, setSelected }) => {
  const toggle = (value: string) => {
    if (selected !== value) {
      setSelected(value);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <ul style={{ margin: 0, padding: 0, listStyleType: 'none' }}>
        {values.map(value => (
          <li key={value}>
            <input type="radio" id={value} name={value} value={value} checked={selected === value} onChange={() => toggle(value)} />
            <span style={{ color: 'white' }}>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

interface Categorizable {
  labels: { name?: string }[],
  date: Date,
  index: number,
}

const displayedIssues = <T extends Categorizable>(
  issuesData: T[],
  selectedTeams: string[],
  selectedStatuses: string[],
): T[] => {
  return issuesData
    .filter(issue => selectedTeams.length === 0 || teamLabels(issue).some(team => selectedTeams.includes(team)))
    .filter(issue => selectedStatuses.length === 0 || statusLabels(issue).some(team => selectedStatuses.includes(team)));
}

const splitCategoriesFor = <T extends Categorizable>(
  displayedIssuesData: T[],
  disjointSplit: boolean,
  splitBy: SplitBy,
  author: (issue: T) => string | undefined | null,
  assignee: (issue: T) => string | undefined | null,
): string[] => {
  const splitCategories = (() => {
    if (disjointSplit) {
      let categories = new Set<string>();
      for (let issue of displayedIssuesData) {
        switch (splitBy) {
          case SplitBy.AUTHOR:
            categories.add(author(issue) || 'NA');
            break;
          case SplitBy.REVIEWER:
            categories.add(assignee(issue) || 'Unassigned');
            break;
          case SplitBy.STATUS:
            categories.add(sorted(statusLabels(issue)).join('_'));
            break;
          case SplitBy.TEAM:
            categories.add(sorted(teamLabels(issue)).join('_'));
            break;
        }
      }
      return Array.from(categories).sort();
    } else {
      let categories = new Set<string>();
      for (let issue of displayedIssuesData) {
        switch (splitBy) {
          case SplitBy.AUTHOR:
            categories.add(author(issue) || 'NA');
            break;
          case SplitBy.REVIEWER:
            categories.add(assignee(issue) || 'Unassigned');
            break;
          case SplitBy.STATUS:
            statusLabels(issue).forEach(label => categories.add(label));
            break;
          case SplitBy.TEAM:
            teamLabels(issue).forEach(label => categories.add(label));
            break;
        }
      }
      return Array.from(categories).sort();
    }
  })();

  splitCategories.reverse();

  return splitCategories;
}

interface TimePoint {
  date: Date,
  value: number,
  index: number,
  size: number,
}
const timesFor = <T extends Categorizable>(
  displayedIssuesData: T[],
  splitCategories: string[],
  disjointSplit: boolean,
  splitBy: SplitBy,
  hoveredItem: TimePoint | undefined,
  author: (issue: T) => string | undefined | null,
  assignee: (issue: T) => string | undefined | null,
): TimePoint[] => {
  return splitCategories.flatMap((category, i) =>
    displayedIssuesData
      .filter(issue => {
        if (disjointSplit) {
          switch (splitBy) {
            case SplitBy.AUTHOR:
              return category === (author(issue) || 'NA');
            case SplitBy.REVIEWER:
              return category === (assignee(issue) || 'Unassigned');
            case SplitBy.STATUS:
              return category === sorted(statusLabels(issue)).join('_');
            case SplitBy.TEAM:
              return category === sorted(teamLabels(issue)).join('_');
          }
        } else {
          switch (splitBy) {
            case SplitBy.AUTHOR:
              return category === (author(issue) || 'NA');
            case SplitBy.REVIEWER:
              return category === (assignee(issue) || 'Unassigned');
            case SplitBy.STATUS:
              return statusLabels(issue).includes(category);
            case SplitBy.TEAM:
              return teamLabels(issue).includes(category);
          }
        }
        return false;
      })
      .map(issue => {
        const value = i;
        const date = issue.date;
        const index = issue.index;
        const size = hoveredItem === undefined || hoveredItem.index !== index ? 3 : 5;
        return {
          date,
          value,
          index,
          size,
        };
      })
  );
}

const TimeResolvedIssues: React.FC<{ issues: IssueState }> = ({ issues }) => {
  const [selectedTeams, setSelectedTeams] = useState<string[]>(issues.teams);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(issues.statuses);
  const [splitBy, setSplitBy] = useState<SplitBy>(SplitBy.TEAM);
  const [viewDate, setViewDate] = useState<ViewDate>(ViewDate.UPDATED_ON);
  const [disjointSplit, setDisjointSplit] = useState<boolean>(false);
  const [hoveredItem, setHoveredItem] = useState<Datum | undefined>(undefined);

  const onHover = (datum: Datum | undefined) => {
    // Just display the last hovered item
    if (datum !== undefined) {
      setHoveredItem(datum);
    }
  }

  type DatedIssue = Issue & { index: number, date: Date };
  const issuesData: DatedIssue[] = issues.issues.map((issue, i) => {
    const dateRaw = (() => {
      switch (viewDate) {
        case ViewDate.CREATED_ON:
          return issue.created_at;
        case ViewDate.UPDATED_ON:
          return issue.updated_at;
      }
    })();
    const date = new Date(dateRaw);
    return { ...issue, index: i, date };
  });

  const displayedIssuesData = displayedIssues(issuesData, selectedTeams, selectedStatuses);
  const splitCategories = splitCategoriesFor(displayedIssuesData, disjointSplit, splitBy, issue => issue.user?.login, issue => issue.assignee?.login);

  const times = timesFor(displayedIssuesData, splitCategories, disjointSplit, splitBy, hoveredItem, issue => issue.user?.login, issue => issue.assignee?.login);

  const timesData = { items: times };

  const xDomain = [d3.timeDay.offset(d3.min(times, d => d.date) as Date, -5), d3.timeDay.offset(d3.max(times, d => d.date) as Date, 5)] as [Date, Date];
  const hoveredItemData = hoveredItem && issuesData[hoveredItem.index];
  const hoveredItemParagraph = hoveredItemData
  ? (
    <p style={{ color: 'white' }}>
      PR: <a href={`https://github.com/rust-lang/rust/pull/${hoveredItemData.number}`} target="_blank" rel="noopener noreferrer">{hoveredItemData.number}</a>
      <br />
      Title: {hoveredItemData.title}
      <br />
      Teams: {sorted(teamLabels(hoveredItemData)).join(', ')}
      <br />
      Author: {hoveredItemData.user?.login || 'Unknown'}
      <br />
      Reviewer: {hoveredItemData.assignee?.login || 'Unassigned'}
      <br />
      Creation Date: {(new Date(hoveredItemData.created_at)).toLocaleDateString()}
      <br />
      Updated Date: {(new Date(hoveredItemData.updated_at)).toLocaleDateString()}
      <br />
      Status: {sorted(statusLabels(hoveredItemData)).join(', ')}
      <br />
    </p>
  )
  : (
    <p>
      PR:
      <br />
      Title:
      <br />
      Teams:
      <br />
      Author:
      <br />
      Reviewer:
      <br />
      Creation Date:
      <br />
      Updated Date:
      <br />
      Status:
      <br />
    </p>
  );

  const dimensions = {
    width: 800,
    height: Math.max(600, splitCategories.length * 10),
    margin: { top: 30, right: 30, bottom: 30, left: 300 }
  };

  return (
    <div style={{ display: 'flex', padding: '10px 50px 50px 10px' }}>
      <InnerChart      
        data={[timesData]}
        dimensions={dimensions}
        xDomain={xDomain}
        onHover={onHover}
        categories={splitCategories}
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ borderWidth: '1px', borderColor: 'black', borderStyle: 'solid' }}>
          {hoveredItemParagraph}
        </div>
        <div style={{ display: 'flex' }}>
          <Checkbox values={issues?.teams ?? []} checked={selectedTeams} setChecked={setSelectedTeams} />
          <Checkbox values={issues?.statuses ?? []} checked={selectedStatuses} setChecked={setSelectedStatuses} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Radio values={Object.values(SplitBy)} selected={splitBy} setSelected={setSplitBy as any} />
            <br />
            <Radio values={Object.values(ViewDate)} selected={viewDate} setSelected={setViewDate as any} />
            <br />
            <Checkbox values={["Disjoint"]} checked={disjointSplit ? ["Disjoint"] : []} setChecked={checked => checked.length > 0 ? setDisjointSplit(true) : setDisjointSplit(false)} />
          </div>
        </div>
      </div>
    </div>
  );
}

const AllPullRequests: React.FC<{ prs: AllPullRequestsState }> = ({ prs }) => {
  const [selectedTeams, setSelectedTeams] = useState<string[]>(prs.teams);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(prs.statuses);
  const [splitBy, setSplitBy] = useState<SplitBy>(SplitBy.TEAM);
  const [disjointSplit, setDisjointSplit] = useState<boolean>(false);
  const [hoveredItem, setHoveredItem] = useState<Datum | undefined>(undefined);

  const onHover = (datum: Datum | undefined) => {
    // Just display the last hovered item
    if (datum !== undefined) {
      setHoveredItem(datum);
    }
  }

  type DatedIssue = SimplePullRequest & { index: number, date: Date };
  const issuesData: DatedIssue[] = prs.prs.map((issue, i) => {
    const date = new Date(issue.created_at);
    return { ...issue, index: i, date };
  });

  const displayedIssuesData = displayedIssues(issuesData, selectedTeams, selectedStatuses);
  const splitCategories = splitCategoriesFor(displayedIssuesData, disjointSplit, splitBy, issue => issue.user, issue => issue.assignee);

  const times = timesFor(displayedIssuesData, splitCategories, disjointSplit, splitBy, hoveredItem, issue => issue.user, issue => issue.assignee);

  const timesData = { items: times };

  const xDomain = [d3.timeDay.offset(d3.min(times, d => d.date) as Date, -5), d3.timeDay.offset(d3.max(times, d => d.date) as Date, 5)] as [Date, Date];

  const hoveredItemData = hoveredItem && issuesData[hoveredItem.index];
  const openDate = hoveredItemData && new Date(hoveredItemData.created_at);
  const closeDate = hoveredItemData && hoveredItemData.closed_at && new Date(hoveredItemData.closed_at);
  const mergeDate = hoveredItemData && hoveredItemData.merged_at && new Date(hoveredItemData.merged_at);

  console.log(hoveredItemData);

  console.log(displayedIssuesData);

  const closeTimes = displayedIssuesData.filter(issue => !!issue.closed_at).map(issue => {
    const openDate = new Date(issue.created_at);
    const closeDate = new Date(issue.closed_at!!);
    const daysOpen = (closeDate.getTime() - openDate.getTime()) / (1000*60*60*24);
    return [closeDate, daysOpen];
  });

  console.log(closeTimes);

  const dimensions = {
    width: 800,
    height: Math.max(600, splitCategories.length * 10),
    margin: { top: 30, right: 30, bottom: 30, left: 300 }
  };

  const violinDimensions = {
    width: 1400,
    height: Math.max(600, splitCategories.length * 10),
    margin: { top: 30, right: 30, bottom: 30, left: 300 }
  };

  const closeViolins = (
    <div style={{ display: 'flex', padding: '10px 50px 50px 10px' }}>
      <ViolinChart
        data={closeTimes as any}
        dimensions={violinDimensions}
        xDomain={xDomain}
      />
    </div>
  );

  const hoveredItemParagraph = hoveredItemData
  ? (
    <p style={{ color: 'white' }}>
      PR: <a href={`https://github.com/rust-lang/rust/pull/${hoveredItemData.number}`} target="_blank" rel="noopener noreferrer">{hoveredItemData.number}</a>
      <br />
      Title: {hoveredItemData.title}
      <br />
      Teams: {sorted(teamLabels(hoveredItemData)).join(', ')}
      <br />
      Author: {hoveredItemData.user || 'Unknown'}
      <br />
      Reviewer: {hoveredItemData.assignee || 'Unassigned'}
      <br />
      Creation Date: {openDate!!.toLocaleDateString()}
      <br />
      Merged Date: {mergeDate ? mergeDate.toLocaleDateString() : 'Open'}
      <br />
      Closed Date: {closeDate ? closeDate.toLocaleDateString() : 'Open'}
      <br />
      Time open: {closeDate ? `${Math.floor((closeDate.getTime() - openDate!!.getTime()) / (1000*60*60*24))} Days` : 'Open'}
      <br />
      Status: {sorted(statusLabels(hoveredItemData)).join(', ')}
      <br />
    </p>
  )
  : (
    <p>
      PR:
      <br />
      Title:
      <br />
      Teams:
      <br />
      Author:
      <br />
      Reviewer:
      <br />
      Creation Date:
      <br />
      Merged Date:
      <br />
      Closed Date:
      <br />
      Status:
      <br />
    </p>
  );

  return (
    <div>
    <div style={{ display: 'flex', padding: '10px 50px 50px 10px' }}>
      <InnerChart      
        data={[timesData]}
        dimensions={dimensions}
        xDomain={xDomain}
        onHover={onHover}
        categories={splitCategories}
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ borderWidth: '1px', borderColor: 'black', borderStyle: 'solid' }}>
          {hoveredItemParagraph}
        </div>
        <div style={{ display: 'flex' }}>
          <Checkbox values={prs.teams ?? []} checked={selectedTeams} setChecked={setSelectedTeams} />
          <Checkbox values={prs.statuses ?? []} checked={selectedStatuses} setChecked={setSelectedStatuses} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Radio values={Object.values(SplitBy)} selected={splitBy} setSelected={setSplitBy as any} />
            <br />
            <Checkbox values={["Disjoint"]} checked={disjointSplit ? ["Disjoint"] : []} setChecked={checked => checked.length > 0 ? setDisjointSplit(true) : setDisjointSplit(false)} />
          </div>
        </div>
      </div>
    </div>
    <div style={{ backgroundColor: 'white' }}>
      {closeViolins}
    </div>
    </div>
  );
}

const InnerChart = React.memo((props: ChartProps) => (
  <Chart
    {...props}
  />
));

const App = () => {
  const [issues, setIssues] = useState<IssueState | undefined>(undefined);
  const [tokenInput, setTokenInput] = useState<string | undefined>(undefined);
  const [abortController, setAbortController] = useState(new AbortController());
  const [allPRs, setAllPRs] = useState<AllPullRequestsState | undefined>(undefined);

  useEffect(() => {
    const abortController = new AbortController();
    setAbortController(abortController);
    return () => {
      console.log('Aborting (unmount)');
      abortController.abort()
    }
  }, []);

  const setData = (issues: Issue[]) => {
    const allTeams = issues.flatMap(issue => teamLabels(issue));
    const teams = uniqueSorted(allTeams);
    const allStatuses = issues.flatMap(issue => statusLabels(issue));
    const statuses = uniqueSorted(allStatuses);
    setIssues({
      issues,
      teams,
      statuses,
    });
  }

  const doFetch = () => {
    if ((tokenInput === undefined || tokenInput === '')) {
      return;
    }
    fetchIssues(tokenInput, abortController.signal).then(data => {
      setData(data as Issue[]);
    }).catch(() => {});
  };

  const downloadIssues = () => {
    if (issues === undefined) {
      return;
    }
    const url = window.URL.createObjectURL(
      new Blob([JSON.stringify(issues.issues)], {type: 'text/json'})
    );
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `issues.json`);
    document.body.appendChild(link);
    link.click();
    link.parentNode!.removeChild(link);
  }

  const uploadIssues = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.addEventListener('change', (e: any) => {
      input.parentNode!.removeChild(input);

      const selectedFile = e.target!.files[0];
      if (selectedFile === undefined) {
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', (event: any) => {
        const data = JSON.parse(event.target.result);
        setData(data);
      });
      reader.readAsText(selectedFile);
    });
    document.body.appendChild(input);
    input.click();
  }

  const uploadAllPRs = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.addEventListener('change', (e: any) => {
      input.parentNode!.removeChild(input);

      const selectedFile = e.target!.files[0];
      if (selectedFile === undefined) {
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', (event: any) => {
        const data = JSON.parse(event.target.result) as SimplePullRequest[];
        const allTeams = data.flatMap(issue => teamLabels(issue));
        const teams = uniqueSorted(allTeams);
        const allStatuses = data.flatMap(issue => statusLabels(issue));
        const statuses = uniqueSorted(allStatuses);
        setAllPRs({
          prs: data,
          teams,
          statuses,
        });
      });
      reader.readAsText(selectedFile);
    });
    document.body.appendChild(input);
    input.click();
  }

  return (
    <div className="App">
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
        <button onClick={() => { console.log('Aborting (click)'); abortController.abort() }}>Abort Fetch</button>
        <div style={{ width: '5px' }} />
        <button style={issues === undefined ? { color: '#66666666' } : {}} onClick={downloadIssues}>Download Issues</button>
        <button onClick={uploadIssues}>Upload Issues</button>
        <div style={{ width: '5px' }} />
        <button onClick={uploadAllPRs}>Upload All PRs</button>
        <div style={{ width: '20px' }} />
        <input type="text" placeholder="Github Token" style={{ width: '330px' }} onChange={event => setTokenInput(event.target.value === '' ? undefined : event.target.value) } />
        <button style={(tokenInput === undefined || tokenInput === '') ? { color: '#66666666' } : {}} onClick={doFetch}>Fetch Issues</button>
      </div>
      <div style={{ minWidth: '98vw', height: issues === undefined ? '800px' : `${issues.issues.length * 4}px` }}>
        {issues !== undefined && (
          <TimeResolvedIssues issues={issues} />
        )}
      </div>
      {allPRs && (
        <AllPullRequests prs={allPRs} />
      )}
    </div>
  )
}
export default App;
