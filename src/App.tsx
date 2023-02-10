import React, { useState } from 'react';
import './App.css';
import { fetchIssues } from './fetch_issues';
import { components } from './github';
import Chart from './chart';
import { ChartProps } from './chart';
import * as d3 from "d3";

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

const uniqueSorted = (values: string[]): string[] => {
  const counts = values.reduce((counts, name) => {
    counts[name] = (counts[name] || 0) + 1;
    return counts;
  }, {} as any);

  const uniques = Object.keys(counts);
  uniques.sort((a, b) => counts[a] === counts[b] ? a.localeCompare(b) : counts[b] - counts[a]);

  return uniques;
};

const teamLabels = (issue: Issue): string[] => issue.labels.map(value => value.name).filter(value => value && value.startsWith('T-')).map(value => value!!);
const statusLabels = (issue: Issue): string[] => issue.labels.map(value => value.name).filter(value => value && value.startsWith('S-')).map(value => value!!);

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

  const splitMap = {} as { [name: string]: number };

  switch (splitBy) {
    case SplitBy.REVIEWER:
      splitMap["Unassigned"] = 0;
      break;
    case SplitBy.AUTHOR:
    case SplitBy.STATUS:
    case SplitBy.TEAM:
      splitMap[""] = 0;
      break;
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

  const displayedIssuesData = issuesData
    .filter(issue => selectedTeams.length === 0 || teamLabels(issue).some(team => selectedTeams.includes(team)))
    .filter(issue => selectedStatuses.length === 0 || statusLabels(issue).some(team => selectedStatuses.includes(team)));
  const splitCategories = (() => {
    if (disjointSplit) {
      let categories = new Set<string>();
      for (let issue of displayedIssuesData) {
        switch (splitBy) {
          case SplitBy.AUTHOR:
            categories.add(issue.user?.login || 'NA');
            break;
          case SplitBy.REVIEWER:
            categories.add(issue.assignee?.login || 'Unassigned');
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
            categories.add(issue.user?.login || 'NA');
            break;
          case SplitBy.REVIEWER:
            categories.add(issue.assignee?.login || 'Unassigned');
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

  const times = splitCategories.flatMap((category, i) =>
    displayedIssuesData
      .filter(issue => {
        if (disjointSplit) {
          switch (splitBy) {
            case SplitBy.AUTHOR:
              return category === (issue.user?.login || 'NA');
            case SplitBy.REVIEWER:
              return category === (issue.assignee?.login || 'Unassigned');
            case SplitBy.STATUS:
              return category === sorted(statusLabels(issue)).join('_');
            case SplitBy.TEAM:
              return category === sorted(teamLabels(issue)).join('_');
          }
        } else {
          switch (splitBy) {
            case SplitBy.AUTHOR:
              return category === (issue.user?.login || 'NA');
            case SplitBy.REVIEWER:
              return category === (issue.assignee?.login || 'Unassigned');
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

const InnerChart = React.memo((props: ChartProps) => (
  <Chart
    {...props}
  />
));

const App = () => {
  const [issues, setIssues] = useState<IssueState | undefined>(undefined);
  const [tokenInput, setTokenInput] = useState<string | undefined>(undefined);

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
    fetchIssues(tokenInput).then(data => {
      setData(data as Issue[]);
    });
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

  return (
    <div className="App">
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
        <button onClick={uploadIssues}>Upload Issues</button>
        <div style={{ width: '5px' }} />
        <button style={issues === undefined ? { color: '#66666666' } : {}} onClick={downloadIssues}>Download Issues</button>
        <div style={{ width: '20px' }} />
        <input type="text" placeholder="Github Token" style={{ width: '330px' }} onChange={event => setTokenInput(event.target.value === '' ? undefined : event.target.value) } />
        <button style={(tokenInput === undefined || tokenInput === '') ? { color: '#66666666' } : {}} onClick={doFetch}>Fetch Issues</button>
      </div>
      <div style={{ minWidth: '98vw', height: issues === undefined ? '800px' : `${issues.issues.length * 4}px` }}>
        {issues !== undefined && (
          <TimeResolvedIssues issues={issues} />
        )}
      </div>
    </div>
  )
}
export default App;
